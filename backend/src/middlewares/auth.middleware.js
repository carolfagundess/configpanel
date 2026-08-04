import { verifyToken } from '../providers/auth.provider.js';

export function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    // Verifica se o cabeçalho de autorização está presente e se começa com "Bearer "
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido ou inválido' });
    }

    const token = authHeader.split(' ')[1]; // Extrai o token do cabeçalho

    try {
        const decoded = verifyToken(token); // Verifica e decodifica o token
        req.user = decoded; // Adiciona as informações do usuário decodificadas à requisição
        next(); // Chama o próximo middleware ou rota
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

