import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

// Prefixo próprio (TESTCOMGET-) para não colidir com a limpeza de TEST-%, TESTIP-%, TESTEQ-%, TESTEQPOST-%, TESTCOM-% e FSM-INT-% de outros testes
const protocolNumber = `TESTCOMGET-${Date.now()}`;
const testToken = generateToken({ id: 'test-user-id', name: 'Usuário de Teste' });
let protocolId;

async function createProtocol(suffix, circuit) {
  const response = await request(app)
    .post('/protocols')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      protocol_number: `${protocolNumber}${suffix}`,
      circuit_number: circuit,
      client_name: 'Cliente Teste Comunicações GET',
      topology: 'GPON',
      address: 'Rua de Teste, 1',
    });
  return response.body.id;
}

function listCommunications(id = protocolId) {
  return request(app)
    .get(`/protocols/${id}/comunicacoes`)
    .set('Authorization', `Bearer ${testToken}`);
}

beforeAll(async () => {
  protocolId = await createProtocol('', 'CIRC-TESTCOMGET-01');
});

describe('GET /protocols/:id/comunicacoes', () => {
  it('deve listar as comunicações do protocolo em {rows,total} (200)', async () => {
    const { rows: inserted } = await pool.query(
      'INSERT INTO client_communications (protocol_id, content) VALUES ($1, $2) RETURNING id',
      [protocolId, 'TESTCOMGET: cliente contatado por telefone']
    );

    const response = await listCommunications();

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.rows)).toBe(true);
    expect(response.body.total).toBe(response.body.rows.length);
    expect(response.body.total).toBe(1);

    const found = response.body.rows.find((com) => com.id === inserted[0].id);
    expect(found).toBeDefined();
    expect(found.protocol_id).toBe(protocolId);
    expect(found.content).toBe('TESTCOMGET: cliente contatado por telefone');
    expect(found).toHaveProperty('created_at');
  });

  it('deve ordenar por created_at decrescente (200)', async () => {
    const orderedId = await createProtocol('-ORDEM', 'CIRC-TESTCOMGET-02');
    // created_at explícito para não depender da resolução do relógio entre os INSERTs
    await pool.query(
      `INSERT INTO client_communications (protocol_id, content, created_at)
       VALUES ($1, 'TESTCOMGET: antiga', '2026-01-01 10:00:00'), ($1, 'TESTCOMGET: recente', '2026-01-02 10:00:00')`,
      [orderedId]
    );

    const response = await listCommunications(orderedId);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.rows[0].content).toBe('TESTCOMGET: recente');
    expect(response.body.rows[1].content).toBe('TESTCOMGET: antiga');
  });

  it('deve retornar lista vazia para protocolo sem comunicações (200)', async () => {
    const emptyId = await createProtocol('-VAZIO', 'CIRC-TESTCOMGET-03');

    const response = await listCommunications(emptyId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ rows: [], total: 0 });
  });

  it('deve retornar 404 para protocolo inexistente', async () => {
    const response = await listCommunications('00000000-0000-0000-0000-000000000000');

    expect(response.status).toBe(404);
  });

  it('deve rejeitar requisição sem token (401)', async () => {
    const response = await request(app).get(`/protocols/${protocolId}/comunicacoes`);

    expect(response.status).toBe(401);
  });

  it('deve rejeitar id fora do formato UUID (400)', async () => {
    const response = await listCommunications('nao-e-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/id/i);
  });
});

afterAll(async () => {
  await pool.query("DELETE FROM client_communications WHERE protocol_id IN (SELECT id FROM protocols WHERE protocol_number LIKE 'TESTCOMGET-%')");
  await pool.query("DELETE FROM protocols WHERE protocol_number LIKE 'TESTCOMGET-%'");
  await pool.end();
});
