import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

// Prefixo próprio (TESTCHKPATCH-) para não colidir com a limpeza de TEST-%, TESTIP-%, TESTEQ-%, TESTEQPOST-%, TESTCOM-%, TESTCOMGET-%, TESTCHK-%, TESTCHKPOST-% e FSM-INT-% de outros testes
const protocolNumber = `TESTCHKPATCH-${Date.now()}`;
const otherProtocolNumber = `TESTCHKPATCH-OUTRO-${Date.now()}`;
const username = `TESTCHKPATCH-user-${Date.now()}`;
const unknownId = '00000000-0000-0000-0000-000000000000';
let userId;
let testToken;
let protocolId;
let otherProtocolId;

function createProtocol(number, circuit) {
  return request(app)
    .post('/protocols')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      protocol_number: number,
      circuit_number: circuit,
      client_name: 'Cliente Teste Checklist PATCH',
      topology: 'GPON',
      address: 'Rua de Teste, 1',
    });
}

async function createItem(id = protocolId, body = { item_type: 'equipment' }) {
  const response = await request(app)
    .post(`/protocols/${id}/checklist`)
    .set('Authorization', `Bearer ${testToken}`)
    .send(body);
  return response.body;
}

function patchItem(body, id = protocolId, itemId) {
  return request(app)
    .patch(`/protocols/${id}/checklist/${itemId}`)
    .set('Authorization', `Bearer ${testToken}`)
    .send(body);
}

async function findItem(itemId) {
  const { rows } = await pool.query('SELECT * FROM checklist_items WHERE id = $1', [itemId]);
  return rows[0];
}

beforeAll(async () => {
  // Usuário real: completed_by é FK para users(id) (UUID) e o token do login carrega userId
  const { rows } = await pool.query(
    'INSERT INTO users (name, username, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Usuário Teste PATCH', username, 'hash-ficticio']
  );
  userId = rows[0].id;
  testToken = generateToken({ userId, username });

  protocolId = (await createProtocol(protocolNumber, 'CIRC-TESTCHKPATCH-01')).body.id;
  otherProtocolId = (await createProtocol(otherProtocolNumber, 'CIRC-TESTCHKPATCH-02')).body.id;
});

describe('PATCH /protocols/:id/checklist/:itemId', () => {
  it('deve marcar o item como feito, gravando completed_at e completed_by (200)', async () => {
    const item = await createItem();

    const response = await patchItem({ is_done: true }, protocolId, item.id);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(item.id);
    expect(response.body.is_done).toBe(true);
    expect(response.body.completed_at).not.toBeNull();
    expect(response.body.completed_by).toBe(userId);
    expect(await findItem(item.id)).toMatchObject({ is_done: true, completed_by: userId });
  });

  it('deve desmarcar o item, zerando completed_at e completed_by (200)', async () => {
    const item = await createItem();
    await patchItem({ is_done: true }, protocolId, item.id);

    const response = await patchItem({ is_done: false }, protocolId, item.id);

    expect(response.status).toBe(200);
    expect(response.body.is_done).toBe(false);
    expect(response.body.completed_at).toBeNull();
    expect(response.body.completed_by).toBeNull();
  });

  it('deve regravar completed_at ao marcar true de novo (200)', async () => {
    const item = await createItem();
    const first = await patchItem({ is_done: true }, protocolId, item.id);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await patchItem({ is_done: true }, protocolId, item.id);

    expect(second.status).toBe(200);
    expect(second.body.completed_by).toBe(userId);
    expect(new Date(second.body.completed_at).getTime()).toBeGreaterThan(new Date(first.body.completed_at).getTime());
  });

  it('não deve alterar os demais campos do item', async () => {
    const item = await createItem(protocolId, { item_type: 'client_contact', is_required: false });

    const response = await patchItem({ is_done: true }, protocolId, item.id);

    expect(response.body.protocol_id).toBe(protocolId);
    expect(response.body.item_type).toBe('client_contact');
    expect(response.body.is_required).toBe(false);
    expect(response.body.created_at).toBe(item.created_at);
  });

  it('deve rejeitar is_done ausente ou que não é booleano (400)', async () => {
    const item = await createItem();

    for (const body of [{}, { is_done: 'true' }, { is_done: 1 }, { is_done: 0 }, { is_done: null }]) {
      const response = await patchItem(body, protocolId, item.id);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/is_done/);
    }

    expect((await findItem(item.id)).is_done).toBe(false);
  });

  it('deve rejeitar :id ou :itemId fora do formato UUID (400)', async () => {
    const item = await createItem();

    const badProtocol = await patchItem({ is_done: true }, 'nao-e-uuid', item.id);
    expect(badProtocol.status).toBe(400);
    expect(badProtocol.body.error).toMatch(/id/i);

    const badItem = await patchItem({ is_done: true }, protocolId, 'nao-e-uuid');
    expect(badItem.status).toBe(400);
    expect(badItem.body.error).toMatch(/id/i);
  });

  it('deve retornar 404 para protocolo inexistente', async () => {
    const item = await createItem();

    const response = await patchItem({ is_done: true }, unknownId, item.id);

    expect(response.status).toBe(404);
  });

  it('deve retornar 404 para item inexistente', async () => {
    const response = await patchItem({ is_done: true }, protocolId, unknownId);

    expect(response.status).toBe(404);
  });

  it('deve retornar 404 para item de outro protocolo e não alterá-lo', async () => {
    const item = await createItem(otherProtocolId);

    const response = await patchItem({ is_done: true }, protocolId, item.id);

    expect(response.status).toBe(404);
    expect(await findItem(item.id)).toMatchObject({ is_done: false, completed_at: null, completed_by: null });
  });

  it('deve rejeitar requisição sem token (401)', async () => {
    const item = await createItem();

    const response = await request(app)
      .patch(`/protocols/${protocolId}/checklist/${item.id}`)
      .send({ is_done: true });

    expect(response.status).toBe(401);
  });
});

afterAll(async () => {
  await pool.query("DELETE FROM checklist_items WHERE protocol_id IN (SELECT id FROM protocols WHERE protocol_number LIKE 'TESTCHKPATCH-%')");
  await pool.query("DELETE FROM protocols WHERE protocol_number LIKE 'TESTCHKPATCH-%'");
  await pool.query("DELETE FROM users WHERE username LIKE 'TESTCHKPATCH-%'");
  await pool.end();
});
