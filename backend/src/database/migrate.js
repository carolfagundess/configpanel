import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function runMigrations() {
  const migrationsPath = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsPath).sort();

  console.log('Iniciando migrations...');

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    console.log(`Rodando migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf8');
    await pool.query(sql);
    console.log(`✔ ${file} concluída`);
  }

  console.log('Todas as migrations concluídas!');
  await pool.end();
}

runMigrations().catch(err => {
  console.error('Erro na migration:', err.message);
  process.exit(1);
});