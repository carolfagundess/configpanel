import bcrypt from 'bcrypt';

const senha = process.argv[2]; // pega o argumento passado no terminal

if (!senha) {
  console.error('Uso: node gerar-hash.js <senha>');
  process.exit(1);
}

const hash = await bcrypt.hash(senha, 10);
console.log(hash);