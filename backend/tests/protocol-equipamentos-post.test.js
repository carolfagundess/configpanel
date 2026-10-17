import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

// Prefixo próprio (TESTEQPOST-) para não colidir com a limpeza de TESTEQ-% e TESTIP-% de outros testes
const protocolNumber = `TESTEQPOST-${Date.now()}`;
const testToken = generateToken({ id: 'test-user-id', name: 'Usuário de Teste' });
let protocolId;

async function countEquipment() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM equipment WHERE protocol_id = $1', [protocolId]);
  return rows[0].total;
}

function postEquipment(body, id = protocolId) {
  return request(app)
    .post(`/protocols/${id}/equipamentos`)
    .set('Authorization', `Bearer ${testToken}`)
    .send(body);
}

beforeAll(async () => {
  const response = await request(app)
    .post('/protocols')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      protocol_number: protocolNumber,
      circuit_number: 'CIRC-TESTEQPOST-01',
      client_name: 'Cliente Teste Equipamentos POST',
      topology: 'GPON',
      address: 'Rua de Teste, 1',
    });
  protocolId = response.body.id;
});

describe('POST /protocols/:id/equipamentos', () => {
  it('deve registrar o equipamento e normalizar o MAC (201)', async () => {
    const before = await countEquipment();

    const response = await postEquipment({
      model: 'TESTEQPOST-ONU-01',
      serial_number: 'TESTEQPOST-SN-001',
      mac_address: 'aa-bb-cc-dd-ee-ff',
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.protocol_id).toBe(protocolId);
    expect(response.body.model).toBe('TESTEQPOST-ONU-01');
    expect(response.body.serial_number).toBe('TESTEQPOST-SN-001');
    expect(response.body.mac_address).toBe('AA:BB:CC:DD:EE:FF');
    expect(response.body.ownership).toBe('unifique');

    expect(await countEquipment()).toBe(before + 1);
  });

  it('deve aceitar MAC com pontos ou sem separadores e ownership last_mile (201)', async () => {
    const dotted = await postEquipment({
      model: 'TESTEQPOST-ONU-02',
      serial_number: 'TESTEQPOST-SN-002',
      mac_address: '0011.2233.4455',
      ownership: 'last_mile',
    });
    expect(dotted.status).toBe(201);
    expect(dotted.body.mac_address).toBe('00:11:22:33:44:55');
    expect(dotted.body.ownership).toBe('last_mile');

    const plain = await postEquipment({
      model: 'TESTEQPOST-ONU-03',
      serial_number: 'TESTEQPOST-SN-003',
      mac_address: 'a1b2c3d4e5f6',
    });
    expect(plain.status).toBe(201);
    expect(plain.body.mac_address).toBe('A1:B2:C3:D4:E5:F6');
  });

  it('deve rejeitar campo obrigatório ausente, vazio ou que não é texto (400)', async () => {
    const before = await countEquipment();
    const valid = { model: 'TESTEQPOST-ONU-04', serial_number: 'TESTEQPOST-SN-004', mac_address: '00:11:22:33:44:66' };

    for (const field of ['model', 'serial_number', 'mac_address']) {
      const { [field]: _omitted, ...missing } = valid;
      const absent = await postEquipment(missing);
      expect(absent.status).toBe(400);

      const empty = await postEquipment({ ...valid, [field]: '   ' });
      expect(empty.status).toBe(400);

      const notString = await postEquipment({ ...valid, [field]: 123 });
      expect(notString.status).toBe(400);
    }

    expect(await countEquipment()).toBe(before);
  });

  it('deve rejeitar MAC inválido (400)', async () => {
    const before = await countEquipment();

    for (const mac of ['00:11:22:33:44', '00:11:22:33:44:55:66', 'GG:11:22:33:44:55', 'não-é-mac']) {
      const response = await postEquipment({
        model: 'TESTEQPOST-ONU-05',
        serial_number: 'TESTEQPOST-SN-005',
        mac_address: mac,
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/mac_address/i);
    }

    expect(await countEquipment()).toBe(before);
  });

  it('deve rejeitar ownership inválido (400)', async () => {
    const response = await postEquipment({
      model: 'TESTEQPOST-ONU-06',
      serial_number: 'TESTEQPOST-SN-006',
      mac_address: '00:11:22:33:44:77',
      ownership: 'invalido',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/ownership/i);
  });

  it('deve retornar 404 para protocolo inexistente', async () => {
    const response = await postEquipment(
      { model: 'TESTEQPOST-ONU-07', serial_number: 'TESTEQPOST-SN-007', mac_address: '00:11:22:33:44:88' },
      '00000000-0000-0000-0000-000000000000'
    );

    expect(response.status).toBe(404);
  });

  it('deve rejeitar requisição sem token (401)', async () => {
    const response = await request(app)
      .post(`/protocols/${protocolId}/equipamentos`)
      .send({ model: 'TESTEQPOST-ONU-08', serial_number: 'TESTEQPOST-SN-008', mac_address: '00:11:22:33:44:99' });

    expect(response.status).toBe(401);
  });

  it('deve rejeitar id fora do formato UUID (400)', async () => {
    const response = await postEquipment(
      { model: 'TESTEQPOST-ONU-09', serial_number: 'TESTEQPOST-SN-009', mac_address: '00:11:22:33:44:AA' },
      'nao-e-uuid'
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/id/i);
  });
});

afterAll(async () => {
  await pool.query("DELETE FROM equipment WHERE protocol_id IN (SELECT id FROM protocols WHERE protocol_number LIKE 'TESTEQPOST-%')");
  await pool.query("DELETE FROM protocols WHERE protocol_number LIKE 'TESTEQPOST-%'");
  await pool.end();
});
