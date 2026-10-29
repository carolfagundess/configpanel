// Registra uma linha por requisição, quando a resposta termina:
// [req] <horário ISO UTC com ms> <método> <rota> <status>
// A rota é o padrão do Express (ex.: /protocols/:id/history), sem id nem query string;
// sem rota casada (404, JSON malformado), usa o caminho sem a query.
// Não registra cabeçalhos (Authorization), corpo nem IP.
export function requestLogger(log = console.log) {
    return (req, res, next) => {
        res.on('finish', () => {
            const rota = req.route ? req.baseUrl + req.route.path : req.originalUrl.split('?')[0];
            log(`[req] ${new Date().toISOString()} ${req.method} ${rota} ${res.statusCode}`);
        });
        next();
    };
}
