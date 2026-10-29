// Registra uma linha por requisição, quando a resposta termina:
// [req] <horário ISO UTC com ms> <método> <rota> <status>
// A rota é o padrão do Express (ex.: /protocols/:id/history), sem id nem query string;
// sem rota casada (404, JSON malformado), usa o caminho sem a query.
// Não registra cabeçalhos (Authorization), corpo nem IP.
export function requestLogger(log = console.log) {
    return (req, res, next) => {
        // A rota é guardada quando o Express a casa (atribuição de req.route), e não no 'finish':
        // num erro (next(err)) o Express restaura req.baseUrl ao sair do router e o prefixo (/auth) se perderia.
        let rota = null;
        let route;
        Object.defineProperty(req, 'route', {
            configurable: true,
            enumerable: true,
            get: () => route,
            set: (r) => {
                route = r;
                if (r) rota = (req.baseUrl || '') + r.path;
            },
        });
        res.on('finish', () => {
            log(`[req] ${new Date().toISOString()} ${req.method} ${rota ?? req.originalUrl.split('?')[0]} ${res.statusCode}`);
        });
        next();
    };
}
