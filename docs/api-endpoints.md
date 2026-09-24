# ConfigPanel — Documentação da API

Backend Node.js/Express. Porta padrão: `3001` (variável `PORT`). Todas as requisições e respostas usam JSON.

## Sumário

| Método | Rota              | Auth | Descrição                          |
|--------|-------------------|------|------------------------------------|
| GET    | `/health`         | Não  | Health check                       |
| POST   | `/auth/login`     | Não  | Autentica e retorna token JWT      |
| GET    | `/auth/me`        | Sim  | Dados do usuário autenticado       |
| POST   | `/protocols`      | Sim  | Cria protocolo                     |
| GET    | `/protocols`      | Sim  | Lista protocolos (paginação/filtro)|
| GET    | `/protocols/:id`  | Sim  | Busca protocolo por ID             |
| PATCH  | `/protocols/:id`  | Sim  | Atualiza protocolo / muda status   |

## Autenticação

Rotas protegidas exigem o header:

```
Authorization: Bearer <token>
```

O token é obtido em `POST /auth/login`. Sem token, ou com token inválido/expirado, a resposta é:

```json
// 401
{ "error": "Token não fornecido ou inválido" }
{ "error": "Token inválido ou expirado" }
```

---

## Health

### `GET /health`

**200 OK**
```json
{ "status": "ok", "projeto": "ConfigPanel" }
```

---

## Auth

### `POST /auth/login`

**Body**

| Campo      | Tipo   | Obrigatório |
|------------|--------|-------------|
| `username` | string | Sim         |
| `password` | string | Sim         |

**200 OK**
```json
{
  "token": "<jwt>",
  "user": { "id": "...", "name": "...", "username": "..." }
}
```

**401** — `{ "error": "Credenciais inválidas" }`

### `GET /auth/me`

🔒 Requer token.

**200 OK**
```json
{ "user": { "userId": "...", "username": "...", "iat": 0, "exp": 0 } }
```
O conteúdo de `user` é o payload decodificado do JWT.

---

## Protocolos

### `POST /protocols`

🔒 Requer token. Cria um protocolo com status inicial `RECEBIDO`.

**Body**

| Campo             | Tipo   | Obrigatório | Observações |
|-------------------|--------|-------------|-------------|
| `protocol_number` | string | Sim         | Único no sistema |
| `circuit_number`  | string | Sim         | |
| `client_name`     | string | Sim         | |
| `topology`        | string | Sim         | `GPON` e `PTP` → rede *unifique*; qualquer outro valor → *last_mile*. Imutável após a criação |
| `address`         | string | Sim         | |
| `delivery_method` | string | Só Last Mile| `trunk`, `ip_publico` ou `equipamento` (RN10) |
| `service_id`      | string | Não         | |
| `trunk_id`        | string | Não         | |
| `assignee_id`     | string | Não         | |

**Respostas**

| Código | Situação |
|--------|----------|
| 201    | Protocolo criado (retorna o objeto completo) |
| 400    | Campos obrigatórios ausentes; `delivery_method` ausente/inválido para Last Mile (RN10) |
| 409    | `protocol_number` já cadastrado |
| 500    | Erro interno |

**Exemplo**
```json
{
  "protocol_number": "2026001234",
  "circuit_number": "CIR-0001",
  "client_name": "Empresa X",
  "topology": "GPON",
  "address": "Rua A, 100"
}
```

### `GET /protocols`

🔒 Requer token. Lista protocolos ordenados por `created_at` decrescente.

**Query params**

| Param    | Tipo   | Padrão | Observações |
|----------|--------|--------|-------------|
| `limit`  | inteiro > 0  | 50 | |
| `offset` | inteiro ≥ 0  | 0  | |
| `status` | string | —      | Filtra por status exato |

**200 OK**
```json
{ "rows": [ { "...": "protocolo" } ], "total": 123 }
```
`total` é a contagem com o filtro de status aplicado, sem considerar `limit`/`offset`.

**400** — `limit` ou `offset` inválido. **500** — erro interno.

### `GET /protocols/:id`

🔒 Requer token.

| Código | Situação |
|--------|----------|
| 200    | Retorna o protocolo |
| 400    | `id` com formato inválido (UUID malformado) |
| 404    | Protocolo não encontrado |
| 500    | Erro interno |

### `PATCH /protocols/:id`

🔒 Requer token. Atualização parcial; envie apenas os campos a alterar.

**Campos atualizáveis:** `protocol_number`, `circuit_number`, `client_name`, `service_id`, `delivery_method`, `trunk_id`, `address`, `status`, `assignee_id`. Outros campos enviados são ignorados.

**Regras**
- `topology` é imutável (RN08–RN09). Tentar alterá-la retorna 400; mudança de topologia exige novo protocolo.
- Mudança de `status` é validada pela máquina de estados (veja abaixo). Cada mudança aceita grava um registro imutável em `protocol_history` (RN06).
- Se o body não tiver nenhum campo atualizável, retorna o protocolo atual sem alterações.

| Código | Situação |
|--------|----------|
| 200    | Retorna o protocolo atualizado |
| 400    | Body vazio; `topology` no body; status inexistente; transição inválida; `id` malformado; violação de RN10 |
| 404    | Protocolo não encontrado |
| 500    | Erro interno |

**Exemplo**
```json
{ "status": "EM_ANALISE" }
```

---

## Máquina de estados do protocolo

Status válidos: `RECEBIDO`, `EM_ANALISE`, `EM_CONFIGURACAO`, `SOLICITADO_IP_VLAN`, `EM_CONTATO_CLIENTE`, `AGENDADO`, `EM_INSTALACAO`, `EM_VALIDACAO`, `CONCLUIDO`, `SUSPENSO`, `CANCELADO`, `PROBLEMA_INFRA`.

| De                   | Para (permitidos) |
|----------------------|-------------------|
| `RECEBIDO`           | `EM_ANALISE`, `CANCELADO` |
| `EM_ANALISE`         | `EM_CONFIGURACAO`, `SOLICITADO_IP_VLAN`, `EM_CONTATO_CLIENTE`, `PROBLEMA_INFRA`, `CANCELADO` |
| `EM_CONFIGURACAO`    | `SOLICITADO_IP_VLAN`, `EM_CONTATO_CLIENTE`, `AGENDADO`, `SUSPENSO`, `PROBLEMA_INFRA`, `CANCELADO` |
| `SOLICITADO_IP_VLAN` | `EM_CONFIGURACAO`, `EM_CONTATO_CLIENTE`, `AGENDADO`, `SUSPENSO`, `PROBLEMA_INFRA`, `CANCELADO` |
| `EM_CONTATO_CLIENTE` | `EM_CONFIGURACAO`, `SOLICITADO_IP_VLAN`, `AGENDADO`, `SUSPENSO`, `PROBLEMA_INFRA`, `CANCELADO` |
| `AGENDADO`           | `EM_INSTALACAO`, `SUSPENSO`, `PROBLEMA_INFRA`, `CANCELADO` |
| `EM_INSTALACAO`      | `EM_VALIDACAO`, `PROBLEMA_INFRA`, `CANCELADO` |
| `EM_VALIDACAO`       | `CONCLUIDO`, `EM_INSTALACAO`, `PROBLEMA_INFRA`, `CANCELADO` |
| `SUSPENSO`           | `EM_ANALISE`, `CANCELADO` |
| `PROBLEMA_INFRA`     | `EM_ANALISE`, `EM_CONFIGURACAO`, `SOLICITADO_IP_VLAN`, `EM_CONTATO_CLIENTE`, `AGENDADO`, `EM_INSTALACAO`, `EM_VALIDACAO`, `CANCELADO` |
| `CONCLUIDO`          | — (terminal) |
| `CANCELADO`          | — (terminal) |

> Pendente (TODO no código): exigir checklist completo ao sair da fase técnica (`EM_CONFIGURACAO`, `SOLICITADO_IP_VLAN`, `EM_CONTATO_CLIENTE`) em direção a `AGENDADO`.

## Observações

- `POST /auth/login` não valida a presença de `username`/`password` no body; campos ausentes resultam em erro tratado pelo `next(error)` do Express.
- `GET /protocols` não valida `status` contra a lista de estados válidos; um valor desconhecido retorna lista vazia.
