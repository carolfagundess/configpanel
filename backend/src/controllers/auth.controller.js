import { generateToken } from '../providers/auth.provider.js';
import pool from '../database/connection.js';
import bcrypt from 'bcrypt';

export async function login(req, res, next) {
    try {
        const { username, password } = req.body;

        const result = await pool.query(
            'SELECT id, username, password_hash, name FROM users WHERE username = $1',
            [username]
        );

        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatches) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const token = generateToken({ userId: user.id, username: user.username });

        res.json({ token, user: { id: user.id, name: user.name, username: user.username } });
    } catch (error) {
        next(error);
    }
}

export async function me(req, res, next) {
    // A função me é protegida pelo middleware de autenticação, então req.user já deve estar definido
    res.json({ user: req.user });
}




