import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

const testToken = generateToken({ id: 'test-user-id', name: 'Usuário de Teste FSM' });

async function createTestProtocol(suffix) {
  const response = await request(app)
    .post('/protocols')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      protocol_number: `FSM-INT-${suffix}-${Date.now()}`,
      circuit_number: `CIRC-FSM-${suffix}`,
      client_name: 'Cliente Teste FSM Integração',
      topology: 'GPON',
      address: 'Rua Teste FSM Integração, 1',
    });
  return response.body.id;
}

function patchStatus(id, status) {
  return request(app)
    .patch(`/protocols/${id}`)
    .set('Authorization', `Bearer ${testToken}`)
    .send({ status });
}

async function getLastHistoryEntry(protocolId) {
  const { rows } = await pool.query(
    'SELECT * FROM protocol_history WHERE protocol_id = $1 ORDER BY changed_at DESC LIMIT 1',
    [protocolId]
  );
  return rows[0];
}

describe('FSM — fluxo principal completo (RECEBIDO → CONCLUIDO)', () => {
  let protocolId;

  beforeAll(async () => {
    protocolId = await createTestProtocol('fluxo-principal');
  });

  it('percorre todo o fluxo principal, uma transição válida por vez', async () => {
    const sequence = [
      'EM_ANALISE',
      'EM_CONFIGURACAO',
      'AGENDADO',
      'EM_INSTALACAO',
      'EM_VALIDACAO',
      'CONCLUIDO',
    ];

    for (const status of sequence) {
      const response = await patchStatus(protocolId, status);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe(status);

      const historyEntry = await getLastHistoryEntry(protocolId);
      expect(historyEntry).toBeDefined();
      expect(historyEntry.status).toBe(status);
    }
  });

  it('CONCLUIDO é terminal — qualquer tentativa de saída é rejeitada', async () => {
    const response = await patchStatus(protocolId, 'EM_VALIDACAO');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/inválida/i);
  });

  it('registrou uma linha de histórico para cada transição do fluxo (6 no total)', async () => {
    const { rows } = await pool.query(
      'SELECT status FROM protocol_history WHERE protocol_id = $1 ORDER BY changed_at ASC',
      [protocolId]
    );
    expect(rows.map((r) => r.status)).toEqual([
      'EM_ANALISE', 'EM_CONFIGURACAO', 'AGENDADO', 'EM_INSTALACAO', 'EM_VALIDACAO', 'CONCLUIDO',
    ]);
  });
});

describe('FSM — transições rejeitadas', () => {
  let protocolId;

  beforeAll(async () => {
    protocolId = await createTestProtocol('rejeitadas');
    await patchStatus(protocolId, 'EM_ANALISE'); // sai de RECEBIDO pra ter margem de testar rejeições
  });

  it('rejeita transição pro mesmo estado', async () => {
    const response = await patchStatus(protocolId, 'EM_ANALISE');
    expect(response.status).toBe(400);
  });

  it('rejeita pular etapas (EM_ANALISE → CONCLUIDO)', async () => {
    const response = await patchStatus(protocolId, 'CONCLUIDO');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/não é permitida pela máquina de estados/i);
  });

  it('rejeita status que não existe na FSM', async () => {
    const response = await patchStatus(protocolId, 'FINALIZADO');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/status inválido/i);
  });

  it('nenhuma tentativa rejeitada deixou rastro em protocol_history', async () => {
    const { rows } = await pool.query(
      'SELECT status FROM protocol_history WHERE protocol_id = $1',
      [protocolId]
    );
    // Só a transição válida do beforeAll (RECEBIDO → EM_ANALISE)
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('EM_ANALISE');
  });
});

describe('FSM — fase técnica (trânsito livre)', () => {
  let protocolId;

  beforeAll(async () => {
    protocolId = await createTestProtocol('fase-tecnica');
    await patchStatus(protocolId, 'EM_ANALISE');
  });

  it('transita livremente entre os 3 estados da fase técnica', async () => {
    const r1 = await patchStatus(protocolId, 'EM_CONFIGURACAO');
    expect(r1.status).toBe(200);

    const r2 = await patchStatus(protocolId, 'SOLICITADO_IP_VLAN');
    expect(r2.status).toBe(200);

    const r3 = await patchStatus(protocolId, 'EM_CONTATO_CLIENTE');
    expect(r3.status).toBe(200);

    const r4 = await patchStatus(protocolId, 'EM_CONFIGURACAO');
    expect(r4.status).toBe(200);
  });
});

describe('FSM — SUSPENSO', () => {
  let protocolId;

  beforeAll(async () => {
    protocolId = await createTestProtocol('suspenso');
    await patchStatus(protocolId, 'EM_ANALISE');
    await patchStatus(protocolId, 'EM_CONFIGURACAO');
  });

  it('permite suspender a partir da fase técnica', async () => {
    const response = await patchStatus(protocolId, 'SUSPENSO');
    expect(response.status).toBe(200);
  });

  it('SUSPENSO só retorna para EM_ANALISE — rejeita voltar direto pra AGENDADO', async () => {
    const response = await patchStatus(protocolId, 'AGENDADO');
    expect(response.status).toBe(400);
  });

  it('permite retomar de SUSPENSO para EM_ANALISE', async () => {
    const response = await patchStatus(protocolId, 'EM_ANALISE');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('EM_ANALISE');
  });
});

describe('FSM — CANCELADO (RN07, terminal)', () => {
  let protocolId;

  beforeAll(async () => {
    protocolId = await createTestProtocol('cancelado');
  });

  it('permite cancelar diretamente de RECEBIDO', async () => {
    const response = await patchStatus(protocolId, 'CANCELADO');
    expect(response.status).toBe(200);
  });

  it('CANCELADO não aceita nenhuma transição de saída (reabertura exige novo protocolo)', async () => {
    const response = await patchStatus(protocolId, 'RECEBIDO');
    expect(response.status).toBe(400);
  });
});

describe('FSM — PROBLEMA_INFRA (só a partir de EM_ANALISE em diante)', () => {
  it('rejeita PROBLEMA_INFRA direto de RECEBIDO', async () => {
    const protocolId = await createTestProtocol('problema-infra-recebido');
    const response = await patchStatus(protocolId, 'PROBLEMA_INFRA');
    expect(response.status).toBe(400);
  });

  it('permite PROBLEMA_INFRA a partir de EM_ANALISE, e redireciona pra qualquer estado ativo', async () => {
    const protocolId = await createTestProtocol('problema-infra-fluxo');
    await patchStatus(protocolId, 'EM_ANALISE');

    const toProblema = await patchStatus(protocolId, 'PROBLEMA_INFRA');
    expect(toProblema.status).toBe(200);

    const redirect = await patchStatus(protocolId, 'EM_CONFIGURACAO');
    expect(redirect.status).toBe(200);
  });
});

afterAll(async () => {
  // protocol_history é imutável por gatilho (RN06); desabilita temporariamente
  // só para permitir a limpeza dos dados de teste.
  await pool.query('ALTER TABLE protocol_history DISABLE TRIGGER trg_protocol_history_no_delete');
  await pool.query(
    "DELETE FROM protocol_history WHERE protocol_id IN (SELECT id FROM protocols WHERE protocol_number LIKE 'FSM-INT-%')"
  );
  await pool.query('ALTER TABLE protocol_history ENABLE TRIGGER trg_protocol_history_no_delete');
  await pool.query("DELETE FROM protocols WHERE protocol_number LIKE 'FSM-INT-%'");
  await pool.end();
});