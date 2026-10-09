import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';

describe('GET /health', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.HEALTH_DB_TIMEOUT_MS;
  });

  it('deve retornar 200 com db up quando o banco responde (sem token)', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      projeto: 'ConfigPanel',
      db: 'up',
    });
  });

  it('deve retornar 503 com db down e sem vazar detalhes do driver', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(pool, 'query')
      .mockRejectedValueOnce(
        new Error('password authentication failed for user "app" at 10.0.0.5')
      );

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'error',
      projeto: 'ConfigPanel',
      db: 'down',
    });
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('password');
    expect(raw).not.toContain('10.0.0.5');
  });

  it('deve retornar 503 quando a consulta excede o timeout', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.HEALTH_DB_TIMEOUT_MS = '50';
    jest.spyOn(pool, 'query').mockImplementationOnce(() => new Promise(() => {}));

    const started = Date.now();
    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.db).toBe('down');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

afterAll(async () => {
  await pool.end();
});
