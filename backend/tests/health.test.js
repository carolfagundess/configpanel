import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/database/connection.js';

describe('GET /health', () => {
  it('deve retornar status 200 e confirmar que o backend está no ar', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      projeto: 'ConfigPanel',
    });
  });
});

afterAll(async () => {
  await pool.end();
});