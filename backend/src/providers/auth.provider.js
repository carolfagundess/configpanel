import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET
const EXPIRATION_TIME = '3h'; // Tempo de expiração do token (3 horas   

export function generateToken(payload) {
    // playload é um objeto que contém as informações que você deseja incluir no token, como o ID do usuário, nome, e-mail, etc.
    return jwt.sign(payload, SECRET_KEY, { expiresIn: EXPIRATION_TIME });
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (error) {
        return null; // Retorna null se o token for inválido ou expirado
    }
}

