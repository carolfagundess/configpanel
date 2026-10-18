import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

// Prefixo próprio (TESTCOM-) para não colidir com a limpeza de TEST-%, TESTIP-%, TESTEQ-% e TESTEQPOST-% de outros testes
const protocolNumber = `TESTCOM-${Date.now()}`;
const testToken = generateToken({ id: 'test-user-id', name: 'Usuário de Teste' });
let protocolId;

async function countCommunications() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM client_communications WHERE protocol_id = $1', [protocolId]);
  return rows[0].total;
}

function postCommunication(body, id = protocolId) {
  return request(app)
    .post(`/protocols/${id}/comunicacoes`)
    .set('Authorization', `Bearer ${testToken}`)
    .send(body);
}

beforeAll(async () => {
  const response = await request(app)
    .post('/protocols')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      protocol_number: protocolNumber,
      circuit_number: 'CIRC-TESTCOM-01',
      client_name: 'Cliente Teste Comunicações POST',
      topology: 'GPON',
      address: 'Rua de Teste, 1',
    });
  protocolId = response.body.id;
});

describe('POST /protocols/:id/comunicacoes', () => {
  it('deve registrar a comunicação (201)', async () => {
    const before = await countCommunications();

    const response = await postCommunication({ content: 'TESTCOM: cliente contatado por telefone' });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.protocol_id).toBe(protocolId);
    expect(response.body.content).toBe('TESTCOM: cliente contatado por telefone');
    expect(response.body).toHaveProperty('created_at');

    expect(await countCommunications()).toBe(before + 1);
  });

  it('deve gravar o content sem os espaços das pontas (201)', async () => {
    const response = await postCommunication({ content: '   TESTCOM: texto com espaços nas pontas  \n' });

    expect(response.status).toBe(201);
    expect(response.body.content).toBe('TESTCOM: texto com espaços nas pontas');
  });

  it('deve rejeitar content ausente, vazio, só espaços ou que não é texto (400)', async () => {
    const before = await countCommunications();

    const absent = await postCommunication({});
    expect(absent.status).toBe(400);

    for (const content of ['', '   ', 123, null, ['TESTCOM'], { text: 'TESTCOM' }]) {
      const response = await postCommunication({ content });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/content/i);
    }

    expect(await countCommunications()).toBe(before);
  });

  it('deve retornar 404 para protocolo inexistente', async () => {
    const response = await postCommunication(
      { content: 'TESTCOM: protocolo inexistente' },
      '00000000-0000-0000-0000-000000000000'
    );

    expect(response.status).toBe(404);
  });

  it('deve rejeitar requisição sem token (401)', async () => {
    const response = await request(app)
      .post(`/protocols/${protocolId}/comunicacoes`)
      .send({ content: 'TESTCOM: sem token' });

    expect(response.status).toBe(401);
  });

  it('deve rejeitar id fora do formato UUID (400)', async () => {
    const response = await postCommunication({ content: 'TESTCOM: id inválido' }, 'nao-e-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/id/i);
  });
});

afterAll(async () => {
  await pool.query("DELETE FROM client_communications WHERE protocol_id IN (SELECT id FROM protocols WHERE protocol_number LIKE 'TESTCOM-%')");
  await pool.query("DELETE FROM protocols WHERE protocol_number LIKE 'TESTCOM-%'");
  await pool.end();
});
