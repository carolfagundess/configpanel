import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json());

// Rota de health check — confirma que o backend está no ar
app.get('/health', (req, res) => {
  res.json({ status: 'ok', projeto: 'ConfigPanel' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend ConfigPanel rodando na porta ${PORT}`);
});

