import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

// Prefixo próprio (TESTEQ-) para não colidir com a limpeza de TEST-% e TESTIP-% de outros testes
const protocolNumber = `TESTEQ-${Date.now()}`;
const testToken = generateToken({ id: 'test-user-id', name: 'Usuário de Teste' });
let protocolId;

beforeAll(async () => {
  const response = await request(app)
    .post('/protocols')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      protocol_number: protocolNumber,
      circuit_number: 'CIRC-TESTEQ-01',
      client_name: 'Cliente Teste Equipamentos',
      topology: 'GPON',
      address: 'Rua de Teste, 1',
    });
  protocolId = response.body.id;
});

describe('GET /protocols/:id/equipamentos', () => {
  it('deve listar os equipamentos do protocolo em {rows,total} (200)', async () => {
    const { rows: inserted } = await pool.query(
      `INSERT INTO equipment (protocol_id, model, serial_number)
       VALUES ($1, $2, $3) RETURNING id`,
      [protocolId, 'TESTEQ-ONU-01', 'TESTEQ-SN-001']
    );

    const response = await request(app)
      .get(`/protocols/${protocolId}/equipamentos`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.rows)).toBe(true);
    expect(response.body.total).toBe(response.body.rows.length);
    expect(response.body.total).toBe(1);

    const found = response.body.rows.find((eq) => eq.id === inserted[0].id);
    expect(found).toBeDefined();
    expect(found.protocol_id).toBe(protocolId);
    expect(found.model).toBe('TESTEQ-ONU-01');
    expect(found.ownership).toBe('unifique');
  });

  it('deve retornar lista vazia para protocolo sem equipamentos (200)', async () => {
    const created = await request(app)
      .post('/protocols')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        protocol_number: `${protocolNumber}-VAZIO`,
        circuit_number: 'CIRC-TESTEQ-02',
        client_name: 'Cliente Teste Equipamentos Vazio',
        topology: 'GPON',
        address: 'Rua de Teste, 2',
      });

    const response = await request(app)
      .get(`/protocols/${created.body.id}/equipamentos`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ rows: [], total: 0 });
  });

  it('deve retornar 404 para protocolo inexistente', async () => {
    const response = await request(app)
      .get('/protocols/00000000-0000-0000-0000-000000000000/equipamentos')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(404);
  });

  it('deve rejeitar requisição sem token (401)', async () => {
    const response = await request(app).get(`/protocols/${protocolId}/equipamentos`);

    expect(response.status).toBe(401);
  });

  it('deve rejeitar id fora do formato UUID (400)', async () => {
    const response = await request(app)
      .get('/protocols/nao-e-uuid/equipamentos')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/id/i);
  });
});

afterAll(async () => {
  await pool.query("DELETE FROM equipment WHERE protocol_id IN (SELECT id FROM protocols WHERE protocol_number LIKE 'TESTEQ-%')");
  await pool.query("DELETE FROM protocols WHERE protocol_number LIKE 'TESTEQ-%'");
  await pool.end();
});
