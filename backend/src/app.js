import express from 'express';
import authRoutes from './routes/auth.routes.js';
import protocolsRoutes from './routes/protocols.router.js';
import pool from './database/connection.js';

const app = express();
app.use(express.json());

// Rota de health check — confirma que o backend está no ar e o banco responde.
// O timeout é lido a cada requisição (HEALTH_DB_TIMEOUT_MS, padrão 2000 ms).
app.get('/health', async (req, res) => {
  const timeoutMs = Number(process.env.HEALTH_DB_TIMEOUT_MS) || 2000;
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    const query = pool.query('SELECT 1');
    query.catch(() => {}); // evita rejeição não tratada se o timeout vencer
    await Promise.race([query, timeout]);
    res.json({ status: 'ok', projeto: 'ConfigPanel', db: 'up' });
  } catch (err) {
    // Só o código fica no log: err.message do driver pode conter host/usuário
    console.error('Health check: banco indisponível', err.code || 'timeout');
    res.status(503).json({ status: 'error', projeto: 'ConfigPanel', db: 'down' });
  } finally {
    clearTimeout(timer);
  }
});

app.use('/auth', authRoutes);
app.use('/', protocolsRoutes);

export default app;