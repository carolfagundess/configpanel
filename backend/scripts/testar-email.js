import 'dotenv/config';
import { sendEmail } from '../src/providers/mail.provider.js';

sendEmail({
  to: 'destinatario-teste@example.com',
  subject: 'Teste ConfigPanel',
  html: '<h1>Funcionou!</h1><p>Este é um e-mail de teste do mail.provider.js</p>',
})
  .then(() => console.log('Concluído.'))
  .catch((err) => console.error('Erro ao enviar:', err.message));