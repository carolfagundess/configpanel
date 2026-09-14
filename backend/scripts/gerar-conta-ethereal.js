import nodemailer from 'nodemailer';

nodemailer.createTestAccount()
  .then((conta) => {
    console.log('Objeto completo retornado:');
    console.log(JSON.stringify(conta, null, 2));
  })
  .catch((err) => {
    console.error('Erro ao gerar conta Ethereal:', err.message);
    console.error(err);
  });