import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

const uniqueProtocolNumber = `TEST-${Date.now()}`;
let createdProtocolId;
const testToken = generateToken({ id: 'test-user-id', name: 'Usuário de Teste' });

describe('POST /protocols', () => {
  it('deve criar um protocolo GPON com dados válidos (201)', async () => {
    const response = await request(app)
      .post('/protocols')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        protocol_number: uniqueProtocolNumber,
        circuit_number: 'CIRC-TEST-01',
        client_name: 'Cliente Teste Automatizado',
        topology: 'GPON',
        address: 'Rua de Teste, 123',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.protocol_number).toBe(uniqueProtocolNumber);
    expect(response.body.status).toBe('RECEBIDO');

    createdProtocolId = response.body.id;
  });

  it('deve rejeitar criação sem campos obrigatórios (400)', async () => {
    const response = await request(app)
      .post('/protocols')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        protocol_number: 'TEST-INCOMPLETO',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('deve rejeitar protocolo Last Mile sem delivery_method (RN10) (400)', async () => {
    const response = await request(app)
      .post('/protocols')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        protocol_number: `TEST-LASTMILE-${Date.now()}`,
        circuit_number: 'CIRC-TEST-02',
        client_name: 'Cliente Last Mile',
        topology: 'RADIO',
        address: 'Rua Last Mile, 456',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/delivery_method/i);
  });

  it('deve rejeitar protocol_number duplicado (409)', async () => {
    const response = await request(app)
      .post('/protocols')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        protocol_number: uniqueProtocolNumber,
        circuit_number: 'CIRC-TEST-03',
        client_name: 'Cliente Duplicado',
        topology: 'GPON',
        address: 'Rua Duplicada, 789',
      });

    expect(response.status).toBe(409);
  });
});

describe('GET /protocols', () => {
  it('deve listar protocolos com paginação (200)', async () => {
    const response = await request(app)
      .get('/protocols')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('rows');
    expect(response.body).toHaveProperty('total');
    expect(Array.isArray(response.body.rows)).toBe(true);
    expect(typeof response.body.total).toBe('number');
  });

  it('deve filtrar por status (200)', async () => {
    const response = await request(app)
      .get('/protocols?status=RECEBIDO')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(200);
    response.body.rows.forEach((protocol) => {
      expect(protocol.status).toBe('RECEBIDO');
    });
  });

  it('deve rejeitar limit inválido (400)', async () => {
    const response = await request(app)
      .get('/protocols?limit=-5')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });
});

describe('GET /protocols/:id', () => {
  it('deve retornar o protocolo criado (200)', async () => {
    const response = await request(app)
      .get(`/protocols/${createdProtocolId}`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(createdProtocolId);
  });

  it('deve retornar 404 para id inexistente', async () => {
    const response = await request(app)
      .get('/protocols/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(404);
  });

  it('deve retornar 400 para id em formato inválido', async () => {
    const response = await request(app)
      .get('/protocols/id-invalido')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(400);
  });
});

describe('PATCH /protocols/:id', () => {
  it('deve atualizar o status do protocolo criado (200)', async () => {
    const response = await request(app)
      .patch(`/protocols/${createdProtocolId}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        status: 'EM_ANALISE',
        client_name: 'Cliente Atualizado',
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('EM_ANALISE');
    expect(response.body.client_name).toBe('Cliente Atualizado');
  });

  it('deve rejeitar tentativa de alterar a topology (RN08-09) (400)', async () => {
    const response = await request(app)
      .patch(`/protocols/${createdProtocolId}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        topology: 'PTP',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/imutáve|imutavel/i);
  });

  it('deve rejeitar corpo vazio (400)', async () => {
    const response = await request(app)
      .patch(`/protocols/${createdProtocolId}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('deve retornar 404 para id inexistente', async () => {
    const response = await request(app)
      .patch('/protocols/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        status: 'EM_ANALISE',
      });

    expect(response.status).toBe(404);
  });
});

afterAll(async () => {
  await pool.query('DELETE FROM protocols WHERE protocol_number LIKE $1', ['TEST-%']);
  await pool.end();
});