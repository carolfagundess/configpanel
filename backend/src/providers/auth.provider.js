import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET
const EXPIRATION_TIME = '3h'; // Tempo de expiração do token (3 horas)

export function generateToken(payload) {
    return jwt.sign(payload, SECRET_KEY, { expiresIn: EXPIRATION_TIME });
}

export function verifyToken(token) {
    return jwt.verify(token, SECRET_KEY); // deixa o erro propagar para o middleware tratar
}