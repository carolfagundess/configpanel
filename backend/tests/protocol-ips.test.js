import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

// Prefixo próprio (TESTIP-) para não colidir com a limpeza de TEST-% de protocols.test.js
const protocolNumber = `TESTIP-${Date.now()}`;
const testToken = generateToken({ id: 'test-user-id', name: 'Usuário de Teste' });
let protocolId;

async function countIps() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM ips WHERE protocol_id = $1', [protocolId]);
  return rows[0].total;
}

beforeAll(async () => {
  const response = await request(app)
    .post('/protocols')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      protocol_number: protocolNumber,
      circuit_number: 'CIRC-TESTIP-01',
      client_name: 'Cliente Teste IPs',
      topology: 'GPON',
      address: 'Rua de Teste, 1',
    });
  protocolId = response.body.id;
});

describe('POST /protocols/:id/ips', () => {
  it('deve registrar o IP e persistir no banco (201)', async () => {
    const before = await countIps();

    const response = await request(app)
      .post(`/protocols/${protocolId}/ips`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ address: '192.0.2.10', category: 'gerencia' });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.protocol_id).toBe(protocolId);
    expect(response.body.address).toBe('192.0.2.10');
    expect(response.body.category).toBe('gerencia');
    expect(response.body.ownership).toBe('unifique');

    expect(await countIps()).toBe(before + 1);
  });

  it('deve rejeitar categoria inválida (400)', async () => {
    const response = await request(app)
      .post(`/protocols/${protocolId}/ips`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ address: '192.0.2.11', category: 'invalida' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/category/i);
  });

  it('deve rejeitar endereço que não é IP nem CIDR (400)', async () => {
    const before = await countIps();

    const response = await request(app)
      .post(`/protocols/${protocolId}/ips`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ address: '999.0.2.1', category: 'bloco' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/address/i);
    expect(await countIps()).toBe(before);
  });

  it('deve rejeitar requisição sem token (401)', async () => {
    const response = await request(app)
      .post(`/protocols/${protocolId}/ips`)
      .send({ address: '192.0.2.12', category: 'gerencia' });

    expect(response.status).toBe(401);
  });

  it('deve retornar 404 para protocolo inexistente', async () => {
    const response = await request(app)
      .post('/protocols/00000000-0000-0000-0000-000000000000/ips')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ address: '192.0.2.13', category: 'gerencia' });

    expect(response.status).toBe(404);
  });
});

describe('GET /protocols/:id/ips', () => {
  it('deve listar os IPs do protocolo, incluindo o recém-criado (200)', async () => {
    const created = await request(app)
      .post(`/protocols/${protocolId}/ips`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ address: '192.0.2.20', category: 'bloco' });
    expect(created.status).toBe(201);

    const response = await request(app)
      .get(`/protocols/${protocolId}/ips`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.rows)).toBe(true);
    expect(response.body.total).toBe(response.body.rows.length);
    expect(response.body.total).toBe(await countIps());

    const found = response.body.rows.find((ip) => ip.id === created.body.id);
    expect(found).toBeDefined();
    expect(found.protocol_id).toBe(protocolId);
    expect(found.address).toBe('192.0.2.20');
    expect(found.category).toBe('bloco');
  });

  it('deve retornar 404 para protocolo inexistente', async () => {
    const response = await request(app)
      .get('/protocols/00000000-0000-0000-0000-000000000000/ips')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(404);
  });

  it('deve rejeitar requisição sem token (401)', async () => {
    const response = await request(app).get(`/protocols/${protocolId}/ips`);

    expect(response.status).toBe(401);
  });

  it('deve rejeitar id fora do formato UUID (400)', async () => {
    const response = await request(app)
      .get('/protocols/nao-e-uuid/ips')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/id/i);
  });
});

afterAll(async () => {
  await pool.query("DELETE FROM ips WHERE protocol_id IN (SELECT id FROM protocols WHERE protocol_number LIKE 'TESTIP-%')");
  await pool.query("DELETE FROM protocols WHERE protocol_number LIKE 'TESTIP-%'");
  await pool.end();
});
