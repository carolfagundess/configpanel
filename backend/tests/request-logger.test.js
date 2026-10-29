import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { requestLogger } from '../src/middlewares/request-logger.middleware.js';
import app from '../src/app.js';
import pool from '../src/database/connection.js';

// App de teste com a mesma montagem do app.js: logger antes do express.json(),
// um router com prefixo (/auth) e um sem prefixo (/).
function montarApp(linhas) {
  const teste = express();
  teste.use(requestLogger((linha) => linhas.push(linha)));
  teste.use(express.json());
  const auth = express.Router();
  auth.post('/login', (req, res) => res.json({ token: 'x' }));
  const protocolos = express.Router();
  protocolos.get('/protocols/:id/history', (req, res) => res.json({ rows: [] }));
  protocolos.patch('/protocols/:id/checklist/:itemId', (req, res) => res.json({ is_done: true }));
  teste.use('/auth', auth);
  teste.use('/', protocolos);
  return teste;
}

// Espera o evento finish da resposta (a linha é escrita depois de o supertest receber a resposta).
const aguardarLog = () => new Promise((resolve) => setImmediate(resolve));

const FORMATO = /^\[req\] (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) ([A-Z]+) (\S+) (\d{3})$/;

describe('requestLogger', () => {
  it('deve registrar horário ISO UTC com ms, método, rota padrão (sem id nem query) e status', async () => {
    const linhas = [];
    const antes = Date.now();
    await request(montarApp(linhas)).get('/protocols/123e4567-e89b-12d3-a456-426614174000/history?limit=1');
    await aguardarLog();
    const depois = Date.now();

    expect(linhas).toHaveLength(1);
    const m = linhas[0].match(FORMATO);
    expect(m).not.toBeNull();
    expect(m[2]).toBe('GET');
    expect(m[3]).toBe('/protocols/:id/history');
    expect(m[4]).toBe('200');
    const t = Date.parse(m[1]);
    expect(t).toBeGreaterThanOrEqual(antes);
    expect(t).toBeLessThanOrEqual(depois);
  });

  it('deve incluir o prefixo do router e rotas com dois parâmetros', async () => {
    const linhas = [];
    const teste = montarApp(linhas);
    await request(teste).post('/auth/login').send({ username: 'u', password: 'p' });
    await request(teste).patch('/protocols/1/checklist/2').send({ is_done: true });
    await aguardarLog();

    expect(linhas.map((l) => l.replace(FORMATO, '$2 $3 $4'))).toEqual([
      'POST /auth/login 200',
      'PATCH /protocols/:id/checklist/:itemId 200',
    ]);
  });

  it('não deve registrar o Authorization nem o corpo da requisição', async () => {
    const linhas = [];
    await request(montarApp(linhas))
      .post('/auth/login')
      .set('Authorization', 'Bearer token-secreto-123')
      .send({ username: 'usuario-x', password: 'senha-secreta-456' });
    await aguardarLog();

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).not.toMatch(/token-secreto-123|Bearer|senha-secreta-456|usuario-x|password/);
  });

  it('deve registrar 404 pelo caminho, sem a query string', async () => {
    const linhas = [];
    await request(montarApp(linhas)).get('/nao-existe?segredo=abc');
    await aguardarLog();

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatch(/ GET \/nao-existe 404$/);
    expect(linhas[0]).not.toContain('segredo');
  });

  it('deve registrar o 400 de JSON malformado sem o corpo', async () => {
    const linhas = [];
    await request(montarApp(linhas))
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"password":"senha-secreta-789"');
    await aguardarLog();

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatch(/ POST \/auth\/login 400$/);
    expect(linhas[0]).not.toContain('senha-secreta-789');
  });

  it('não deve ser montado no app quando NODE_ENV é test', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await request(app).get('/nao-existe');
    await aguardarLog();

    expect(spy.mock.calls.some(([linha]) => String(linha).startsWith('[req]'))).toBe(false);
    spy.mockRestore();
  });
});

afterAll(async () => {
  await pool.end();
});
