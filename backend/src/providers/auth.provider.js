import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET
const DEFAULT_EXPIRATION_TIME = '8h'; // Validade padrão do token (8 horas), usada se JWT_EXPIRES_IN não existir

// Lida a cada chamada para respeitar a variável de ambiente (e permitir testar valores diferentes)
function getExpirationTime() {
    return process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRATION_TIME;
}

export function generateToken(payload) {
    return jwt.sign(payload, SECRET_KEY, { expiresIn: getExpirationTime() });
}

export function verifyToken(token) {
    return jwt.verify(token, SECRET_KEY); // deixa o erro propagar para o middleware tratar
}
