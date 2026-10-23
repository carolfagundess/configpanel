import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

// Prefixo próprio (TESTCHKPOST-) para não colidir com a limpeza de TEST-%, TESTIP-%, TESTEQ-%, TESTEQPOST-%, TESTCOM-%, TESTCOMGET-%, TESTCHK-% e FSM-INT-% de outros testes
const protocolNumber = `TESTCHKPOST-${Date.now()}`;
const testToken = generateToken({ id: 'test-user-id', name: 'Usuário de Teste' });
let protocolId;

async function countChecklistItems() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM checklist_items WHERE protocol_id = $1', [protocolId]);
  return rows[0].total;
}

function postChecklistItem(body, id = protocolId) {
  return request(app)
    .post(`/protocols/${id}/checklist`)
    .set('Authorization', `Bearer ${testToken}`)
    .send(body);
}

beforeAll(async () => {
  const response = await request(app)
    .post('/protocols')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      protocol_number: protocolNumber,
      circuit_number: 'CIRC-TESTCHKPOST-01',
      client_name: 'Cliente Teste Checklist POST',
      topology: 'GPON',
      address: 'Rua de Teste, 1',
    });
  protocolId = response.body.id;
});

describe('POST /protocols/:id/checklist', () => {
  it('deve registrar o item do checklist com os campos corretos (201)', async () => {
    const before = await countChecklistItems();

    const response = await postChecklistItem({ item_type: 'equipment' });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.protocol_id).toBe(protocolId);
    expect(response.body.item_type).toBe('equipment');
    expect(response.body.is_required).toBe(true);
    expect(response.body.is_done).toBe(false);
    expect(response.body.completed_at).toBeNull();
    expect(response.body.completed_by).toBeNull();
    expect(response.body).toHaveProperty('created_at');
    expect(await countChecklistItems()).toBe(before + 1);
  });

  it('deve aceitar is_required=false (201)', async () => {
    const response = await postChecklistItem({ item_type: 'client_contact', is_required: false });

    expect(response.status).toBe(201);
    expect(response.body.item_type).toBe('client_contact');
    expect(response.body.is_required).toBe(false);
  });

  it('deve rejeitar item_type ausente, vazio ou fora de equipment/ip_vlan/client_contact (400)', async () => {
    const before = await countChecklistItems();
    const invalidBodies = [
      {},
      { item_type: '' },
      { item_type: 'outro' },
      { item_type: 'EQUIPMENT' },
      { item_type: 123 },
      { item_type: null },
    ];

    for (const body of invalidBodies) {
      const response = await postChecklistItem(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/item_type/);
    }

    expect(await countChecklistItems()).toBe(before);
  });

  it('deve rejeitar is_required que não é booleano, inclusive null (400)', async () => {
    const before = await countChecklistItems();

    for (const value of ['sim', 1, 0, null, 'true']) {
      const response = await postChecklistItem({ item_type: 'ip_vlan', is_required: value });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/is_required/);
    }

    expect(await countChecklistItems()).toBe(before);
  });

  it('deve retornar 404 para protocolo inexistente', async () => {
    const response = await postChecklistItem({ item_type: 'equipment' }, '00000000-0000-0000-0000-000000000000');

    expect(response.status).toBe(404);
  });

  it('deve rejeitar requisição sem token (401)', async () => {
    const response = await request(app)
      .post(`/protocols/${protocolId}/checklist`)
      .send({ item_type: 'equipment' });

    expect(response.status).toBe(401);
  });

  it('deve rejeitar id fora do formato UUID (400)', async () => {
    const response = await postChecklistItem({ item_type: 'equipment' }, 'nao-e-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/id/i);
  });
});

afterAll(async () => {
  await pool.query("DELETE FROM checklist_items WHERE protocol_id IN (SELECT id FROM protocols WHERE protocol_number LIKE 'TESTCHKPOST-%')");
  await pool.query("DELETE FROM protocols WHERE protocol_number LIKE 'TESTCHKPOST-%'");
  await pool.end();
});
