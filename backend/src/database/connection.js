const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Testa a conexão ao inicializar
pool.connect((err, client, release) => {
  if (err) {
    console.error('Erro ao conectar no banco:', err.message);
    return;
  }
  console.log('Conectado ao PostgreSQL com sucesso');
  release();
});

module.exports = pool;