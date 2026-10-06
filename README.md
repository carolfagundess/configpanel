# ConfigPanel

Sistema web interno para padronização de processos operacionais e gestão
do ciclo de vida de contratos B2B (setor de Configuração).

## Módulos

- **Módulo de Ferramentas** — utilitários operacionais (client-side, stateless)
- **Módulo Desk** — gestão de protocolos B2B (stateful, com FSM de status)

## Stack

- Frontend: React 19 + Vite
- Backend: Node.js + Express, autenticação JWT (bcrypt), envio de e-mail via Nodemailer
- Banco: PostgreSQL 16
- Testes: Jest + Supertest
- Infra: Docker + Docker Compose
- CI/CD: GitHub Actions → Amazon ECR → deploy via SSH em EC2

## Estrutura

```
configpanel/
├── backend/          # API Express (src/, tests/, scripts/, Dockerfile)
├── frontend/         # SPA React + Vite
├── docs/             # Documentação (API, ADRs, diário DevOps)
├── .github/workflows # Pipeline de CI/CD
└── docker-compose.yml
```

## Como rodar localmente

Pré-requisito: Docker e Docker Compose.

1. Crie os arquivos de ambiente a partir dos exemplos:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
2. Preencha em `backend/.env` ao menos `DB_USER`, `DB_PASSWORD` e `JWT_SECRET`.
   O contêiner do Postgres usa esse mesmo arquivo (`POSTGRES_USER`, `POSTGRES_PASSWORD`
   e `POSTGRES_DB` também devem estar definidos).
3. Suba os serviços:
   ```bash
   docker-compose up
   ```

| Serviço  | URL                     |
|----------|-------------------------|
| Frontend | http://localhost:5173   |
| Backend  | http://localhost:3001   |
| Postgres | localhost:5432          |

Teste rápido: `GET http://localhost:3001/health` deve retornar `{"status":"ok","projeto":"ConfigPanel"}`.

### Variáveis de ambiente do backend

| Variável                      | Descrição                                  |
|-------------------------------|--------------------------------------------|
| `DB_HOST`, `DB_PORT`          | Host e porta do PostgreSQL                 |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Credenciais do banco                 |
| `JWT_SECRET`, `JWT_EXPIRES_IN`| Segredo e validade do token (ex.: `8h`)    |
| `PORT`                        | Porta da API (padrão `3001`)               |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Envio de e-mail |

## Scripts do backend

Executar dentro de `backend/`:

| Comando           | Descrição                                   |
|-------------------|---------------------------------------------|
| `npm run dev`     | Servidor com recarga automática (nodemon)   |
| `npm start`       | Servidor em modo produção                   |
| `npm run migrate` | Aplica as migrations SQL do banco           |
| `npm test`        | Roda os testes (exigem PostgreSQL acessível)|

## API

Endpoints principais (detalhes completos em [docs/api-endpoints.md](docs/api-endpoints.md)):

| Método | Rota             | Auth | Descrição                        |
|--------|------------------|------|----------------------------------|
| GET    | `/health`        | Não  | Health check                     |
| POST   | `/auth/login`    | Não  | Login, retorna token JWT         |
| GET    | `/auth/me`       | Sim  | Usuário autenticado              |
| POST   | `/protocols`     | Sim  | Cria protocolo                   |
| GET    | `/protocols`     | Sim  | Lista com paginação e filtro     |
| GET    | `/protocols/:id` | Sim  | Busca protocolo                  |
| PATCH  | `/protocols/:id` | Sim  | Atualiza protocolo / muda status |

Rotas protegidas exigem o header `Authorization: Bearer <token>`.

## CI/CD

O workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) roda em push e pull request para `main`:

1. **test-backend** — sobe um Postgres, roda migrations e testes
2. **build-docker** — builda a imagem do backend
3. **push-to-ecr** — envia a imagem (`latest` e SHA do commit) para o Amazon ECR
4. **deploy-to-ec2** — conecta via SSH na EC2, faz pull da imagem e reinicia o contêiner

O histórico e as decisões dessa pipeline estão em [docs/devops-log.md](docs/devops-log.md).

## Documentação

- [docs/api-endpoints.md](docs/api-endpoints.md) — endpoints, regras de negócio e máquina de estados
- [docs/adr/](docs/adr/) — decisões arquiteturais, modelo de dados (`erd.md`) e contrato de API (`api.md`)
- [docs/devops-log.md](docs/devops-log.md) — diário do trabalho de DevOps
