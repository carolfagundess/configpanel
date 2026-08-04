import 'dotenv/config';
import express from 'express';
import authRoutes from './routes/auth.routes.js';

const app = express();
app.use(express.json());

// Rota de health check — confirma que o backend está no ar
app.get('/health', (req, res) => {
  res.json({ status: 'ok', projeto: 'ConfigPanel' });
});

app.use('/auth', authRoutes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend ConfigPanel rodando na porta ${PORT}`);
});

