import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

// Prefixo próprio (TESTCHK-) para não colidir com a limpeza de TEST-%, TESTIP-%, TESTEQ-%, TESTEQPOST-%, TESTCOM-%, TESTCOMGET-% e FSM-INT-% de outros testes
const protocolNumber = `TESTCHK-${Date.now()}`;
const testToken = generateToken({ id: 'test-user-id', name: 'Usuário de Teste' });
let protocolId;

async function createProtocol(suffix, circuit) {
  const response = await request(app)
    .post('/protocols')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      protocol_number: `${protocolNumber}${suffix}`,
      circuit_number: circuit,
      client_name: 'Cliente Teste Checklist',
      topology: 'GPON',
      address: 'Rua de Teste, 1',
    });
  return response.body.id;
}

function listChecklist(id = protocolId) {
  return request(app)
    .get(`/protocols/${id}/checklist`)
    .set('Authorization', `Bearer ${testToken}`);
}

beforeAll(async () => {
  protocolId = await createProtocol('', 'CIRC-TESTCHK-01');
});

describe('GET /protocols/:id/checklist', () => {
  it('deve listar os itens do checklist do protocolo em {rows,total} (200)', async () => {
    // Ainda não existe POST de checklist: o item é inserido direto no banco
    const { rows: inserted } = await pool.query(
      'INSERT INTO checklist_items (protocol_id, item_type) VALUES ($1, $2) RETURNING id',
      [protocolId, 'equipment']
    );

    const response = await listChecklist();

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.rows)).toBe(true);
    expect(response.body.total).toBe(response.body.rows.length);
    expect(response.body.total).toBe(1);

    const found = response.body.rows.find((item) => item.id === inserted[0].id);
    expect(found).toBeDefined();
    expect(found.protocol_id).toBe(protocolId);
    expect(found.item_type).toBe('equipment');
    expect(found.is_required).toBe(true);
    expect(found.is_done).toBe(false);
    expect(found.completed_at).toBeNull();
    expect(found.completed_by).toBeNull();
    expect(found).toHaveProperty('created_at');
  });

  it('deve ordenar por created_at decrescente (200)', async () => {
    const orderedId = await createProtocol('-ORDEM', 'CIRC-TESTCHK-02');
    // created_at explícito para não depender da resolução do relógio entre os INSERTs
    await pool.query(
      `INSERT INTO checklist_items (protocol_id, item_type, created_at)
       VALUES ($1, 'ip_vlan', '2026-01-01 10:00:00'), ($1, 'client_contact', '2026-01-02 10:00:00')`,
      [orderedId]
    );

    const response = await listChecklist(orderedId);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.rows[0].item_type).toBe('client_contact');
    expect(response.body.rows[1].item_type).toBe('ip_vlan');
  });

  it('deve retornar lista vazia para protocolo sem itens de checklist (200)', async () => {
    const emptyId = await createProtocol('-VAZIO', 'CIRC-TESTCHK-03');

    const response = await listChecklist(emptyId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ rows: [], total: 0 });
  });

  it('deve retornar 404 para protocolo inexistente', async () => {
    const response = await listChecklist('00000000-0000-0000-0000-000000000000');

    expect(response.status).toBe(404);
  });

  it('deve rejeitar requisição sem token (401)', async () => {
    const response = await request(app).get(`/protocols/${protocolId}/checklist`);

    expect(response.status).toBe(401);
  });

  it('deve rejeitar id fora do formato UUID (400)', async () => {
    const response = await listChecklist('nao-e-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/id/i);
  });
});

afterAll(async () => {
  await pool.query("DELETE FROM checklist_items WHERE protocol_id IN (SELECT id FROM protocols WHERE protocol_number LIKE 'TESTCHK-%')");
  await pool.query("DELETE FROM protocols WHERE protocol_number LIKE 'TESTCHK-%'");
  await pool.end();
});
