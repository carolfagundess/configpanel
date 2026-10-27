import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';
import { generateToken } from '../src/providers/auth.provider.js';

// Prefixo próprio (TESTHIST-) para não colidir com a limpeza de TEST-%, TESTIP-%, TESTEQ-%, TESTEQPOST-%, TESTCOM-%, TESTCOMGET-%, TESTCHK-%, TESTCHKPOST-%, TESTCHKPATCH-% e FSM-INT-% de outros testes
const protocolNumber = `TESTHIST-${Date.now()}`;
const testToken = generateToken({ id: 'test-user-id', name: 'Usuário de Teste' });

async function createProtocol(suffix, circuit) {
  const response = await request(app)
    .post('/protocols')
    .set('Authorization', `Bearer ${testToken}`)
    .send({
      protocol_number: `${protocolNumber}${suffix}`,
      circuit_number: circuit,
      client_name: 'Cliente Teste Histórico',
      topology: 'GPON',
      address: 'Rua de Teste, 1',
    });
  return response.body.id;
}

function patchStatus(id, status) {
  return request(app)
    .patch(`/protocols/${id}`)
    .set('Authorization', `Bearer ${testToken}`)
    .send({ status });
}

function listHistory(id) {
  return request(app)
    .get(`/protocols/${id}/history`)
    .set('Authorization', `Bearer ${testToken}`);
}

describe('GET /protocols/:id/history', () => {
  it('deve listar a linha gravada por uma transição aceita em {rows,total} (200)', async () => {
    const id = await createProtocol('-UMA', 'CIRC-TESTHIST-01');
    await patchStatus(id, 'EM_ANALISE');

    const response = await listHistory(id);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.rows)).toBe(true);
    expect(response.body.total).toBe(response.body.rows.length);
    expect(response.body.total).toBe(1);

    const [entry] = response.body.rows;
    expect(entry.protocol_id).toBe(id);
    expect(entry.status).toBe('EM_ANALISE');
    expect(entry.note).toBe('Transição: RECEBIDO → EM_ANALISE');
    expect(entry).toHaveProperty('changed_at');
    // changed_by ainda não é preenchido pela transição (extra A, adiado)
    expect(entry.changed_by).toBeNull();
  });

  it('deve gravar uma linha por transição aceita, na ordem em que ocorreram (200)', async () => {
    const id = await createProtocol('-VARIAS', 'CIRC-TESTHIST-02');
    for (const status of ['EM_ANALISE', 'EM_CONFIGURACAO', 'SOLICITADO_IP_VLAN']) {
      expect((await patchStatus(id, status)).status).toBe(200);
    }

    const response = await listHistory(id);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(3);
    expect(response.body.rows.map((row) => row.status)).toEqual(['EM_ANALISE', 'EM_CONFIGURACAO', 'SOLICITADO_IP_VLAN']);
  });

  it('não deve gravar linha para transição rejeitada (200)', async () => {
    const id = await createProtocol('-REJ', 'CIRC-TESTHIST-03');
    expect((await patchStatus(id, 'EM_ANALISE')).status).toBe(200);
    expect((await patchStatus(id, 'CONCLUIDO')).status).toBe(400);
    expect((await patchStatus(id, 'FINALIZADO')).status).toBe(400);

    const response = await listHistory(id);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.rows[0].status).toBe('EM_ANALISE');
  });

  it('deve ordenar por changed_at crescente (200)', async () => {
    const orderedId = await createProtocol('-ORDEM', 'CIRC-TESTHIST-04');
    // changed_at explícito para não depender da resolução do relógio; a mais nova é gravada primeiro
    await pool.query(
      `INSERT INTO protocol_history (protocol_id, status, changed_at)
       VALUES ($1, 'EM_CONFIGURACAO', '2026-01-02 10:00:00'), ($1, 'EM_ANALISE', '2026-01-01 10:00:00')`,
      [orderedId]
    );

    const response = await listHistory(orderedId);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.rows[0].status).toBe('EM_ANALISE');
    expect(response.body.rows[1].status).toBe('EM_CONFIGURACAO');
  });

  it('deve retornar lista vazia para protocolo sem histórico (200)', async () => {
    const emptyId = await createProtocol('-VAZIO', 'CIRC-TESTHIST-05');

    const response = await listHistory(emptyId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ rows: [], total: 0 });
  });

  it('deve retornar 404 para protocolo inexistente', async () => {
    const response = await listHistory('00000000-0000-0000-0000-000000000000');

    expect(response.status).toBe(404);
  });

  it('deve rejeitar id fora do formato UUID (400)', async () => {
    const response = await listHistory('nao-e-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/id/i);
  });

  it('deve rejeitar requisição sem token (401)', async () => {
    const response = await request(app).get('/protocols/00000000-0000-0000-0000-000000000000/history');

    expect(response.status).toBe(401);
  });
});

afterAll(async () => {
  // protocol_history é imutável por gatilho (RN06); desabilita temporariamente
  // só para permitir a limpeza dos dados de teste.
  await pool.query('ALTER TABLE protocol_history DISABLE TRIGGER trg_protocol_history_no_delete');
  await pool.query(
    "DELETE FROM protocol_history WHERE protocol_id IN (SELECT id FROM protocols WHERE protocol_number LIKE 'TESTHIST-%')"
  );
  await pool.query('ALTER TABLE protocol_history ENABLE TRIGGER trg_protocol_history_no_delete');
  await pool.query("DELETE FROM protocols WHERE protocol_number LIKE 'TESTHIST-%'");
  await pool.end();
});
