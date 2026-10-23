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
| POST   | `/protocols/:id/ips` | Sim | Registra um IP no protocolo     |
| GET    | `/protocols/:id/ips` | Sim | Lista os IPs do protocolo       |
| POST   | `/protocols/:id/equipamentos` | Sim | Registra um equipamento no protocolo |
| GET    | `/protocols/:id/equipamentos` | Sim | Lista os equipamentos do protocolo |
| POST   | `/protocols/:id/comunicacoes` | Sim | Registra uma comunicação com o cliente no protocolo |
| GET    | `/protocols/:id/comunicacoes` | Sim | Lista as comunicações com o cliente do protocolo |
| GET    | `/protocols/:id/checklist` | Sim | Lista os itens do checklist do protocolo |

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

Público (não exige token). Executa `SELECT 1` no banco com timeout de 2 s (configurável por `HEALTH_DB_TIMEOUT_MS`).

**200 OK** — banco respondeu
```json
{ "status": "ok", "projeto": "ConfigPanel", "db": "up" }
```

**503 Service Unavailable** — banco indisponível ou timeout (sem detalhes do erro)
```json
{ "status": "error", "projeto": "ConfigPanel", "db": "down" }
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
- Mudança de `status` é validada pela máquina de estados (veja abaixo). Cada mudança aceita grava um registro imutável em `protocol_history` (RN06), com o status novo e a nota `Transição: A → B`. O campo `changed_by` (quem mudou) ainda não é preenchido.
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

### `POST /protocols/:id/ips`

🔒 Requer token. Registra um IP (gerência, bloco ou PTP) em um protocolo existente (RF07).

**Body**

| Campo       | Tipo   | Obrigatório | Observações |
|-------------|--------|-------------|-------------|
| `address`   | string | Sim         | IPv4, IPv6 ou CIDR (`ip/prefixo`); no máximo 100 caracteres |
| `category`  | string | Sim         | `gerencia`, `bloco` ou `ptp` |
| `ownership` | string | Não         | `unifique` (padrão) ou `last_mile` |

**Respostas**

| Código | Situação |
|--------|----------|
| 201    | IP criado (retorna o objeto do IP) |
| 400    | Corpo inválido (`address` ou `category` ausente ou inválido, `ownership` inválido); `id` fora do formato UUID |
| 401    | Token ausente, inválido ou expirado |
| 404    | Protocolo não encontrado |
| 500    | Erro interno |

**Exemplo**
```json
{ "address": "192.0.2.1", "category": "gerencia" }
```

### `GET /protocols/:id/ips`

🔒 Requer token. Lista os IPs registrados em um protocolo existente (RF07), ordenados por `created_at` decrescente.

**200 OK**
```json
{ "rows": [ { "...": "ip" } ], "total": 1 }
```
Cada item de `rows` é uma linha da tabela `ips` (`id`, `protocol_id`, `address`, `category`, `ownership`, `created_at`). `total` é o número de itens retornados (`rows.length`); não há paginação.

**Respostas**

| Código | Situação |
|--------|----------|
| 200    | Lista de IPs (vazia se o protocolo não tem IPs) |
| 400    | `id` fora do formato UUID |
| 401    | Token ausente, inválido ou expirado |
| 404    | Protocolo não encontrado |
| 500    | Erro interno |

### `POST /protocols/:id/equipamentos`

🔒 Requer token. Registra um equipamento em um protocolo existente (RF08).

**Body**

| Campo           | Tipo   | Obrigatório | Observações |
|-----------------|--------|-------------|-------------|
| `model`         | string | Sim         | Texto não vazio; no máximo 255 caracteres (após remover espaços das pontas) |
| `serial_number` | string | Sim         | Texto não vazio; no máximo 100 caracteres (após remover espaços das pontas) |
| `mac_address`   | string | Sim         | 12 dígitos hexadecimais; é normalizado (ver abaixo) |
| `ownership`     | string | Não         | `unifique` (padrão) ou `last_mile` |

`model` e `serial_number` são gravados sem os espaços das pontas.

**Normalização do MAC:** aceita os separadores `:`, `-` e `.` (ou nenhum), em maiúsculas ou minúsculas, e grava sempre no formato `AA:BB:CC:DD:EE:FF`. Por exemplo, `aa-bb-cc-dd-ee-ff`, `0011.2233.4455` e `a1b2c3d4e5f6` viram `AA:BB:CC:DD:EE:FF`, `00:11:22:33:44:55` e `A1:B2:C3:D4:E5:F6`. Se não sobrarem exatamente 12 dígitos hexadecimais, retorna 400.

**Respostas**

| Código | Situação |
|--------|----------|
| 201    | Equipamento criado (retorna o objeto do equipamento, com `mac_address` normalizado) |
| 400    | `model`, `serial_number` ou `mac_address` ausente, vazio ou que não é texto; `model` ou `serial_number` acima do limite; `mac_address` inválido; `ownership` inválido; `id` fora do formato UUID |
| 401    | Token ausente, inválido ou expirado |
| 404    | Protocolo não encontrado |
| 500    | Erro interno |

**Exemplo**
```json
{ "model": "ONU-01", "serial_number": "SN-0001", "mac_address": "aa-bb-cc-dd-ee-ff" }
```

### `GET /protocols/:id/equipamentos`

🔒 Requer token. Lista os equipamentos registrados em um protocolo existente (RF08), ordenados por `created_at` decrescente.

**200 OK**
```json
{ "rows": [ { "...": "equipamento" } ], "total": 1 }
```
Cada item de `rows` é uma linha da tabela `equipment` (`id`, `protocol_id`, `model`, `serial_number`, `mac_address`, `ownership`, `created_at`). `total` é o número de itens retornados (`rows.length`); não há paginação.

**Respostas**

| Código | Situação |
|--------|----------|
| 200    | Lista de equipamentos (vazia se o protocolo não tem equipamentos) |
| 400    | `id` fora do formato UUID |
| 401    | Token ausente, inválido ou expirado |
| 404    | Protocolo não encontrado |
| 500    | Erro interno |

### `POST /protocols/:id/comunicacoes`

🔒 Requer token. Registra uma comunicação com o cliente em um protocolo existente (RF09).

**Body**

| Campo     | Tipo   | Obrigatório | Observações |
|-----------|--------|-------------|-------------|
| `content` | string | Sim         | Texto não vazio após remover os espaços das pontas; gravado já aparado. Não há limite de tamanho |

Campos extras no body são ignorados.

**Respostas**

| Código | Situação |
|--------|----------|
| 201    | Comunicação criada (retorna a linha com `id`, `protocol_id`, `content` e `created_at`) |
| 400    | `content` ausente, vazio, só espaços ou que não é texto; `id` fora do formato UUID |
| 401    | Token ausente, inválido ou expirado |
| 404    | Protocolo não encontrado |
| 500    | Erro interno |

**Exemplo**
```json
{ "content": "Cliente contatado por telefone" }
```

### `GET /protocols/:id/comunicacoes`

🔒 Requer token. Lista as comunicações com o cliente registradas em um protocolo existente (RF09), ordenadas por `created_at` decrescente.

**200 OK**
```json
{ "rows": [ { "...": "comunicação" } ], "total": 1 }
```
Cada item de `rows` é uma linha da tabela `client_communications` (`id`, `protocol_id`, `content`, `created_at`). `total` é o número de itens retornados (`rows.length`); não há paginação.

**Respostas**

| Código | Situação |
|--------|----------|
| 200    | Lista de comunicações (vazia, `{ "rows": [], "total": 0 }`, se o protocolo não tem comunicações) |
| 400    | `id` fora do formato UUID |
| 401    | Token ausente, inválido ou expirado |
| 404    | Protocolo não encontrado |
| 500    | Erro interno |

### `GET /protocols/:id/checklist`

🔒 Requer token. Lista os itens do checklist registrados em um protocolo existente (RF10), ordenados por `created_at` decrescente.

**200 OK**
```json
{ "rows": [ { "...": "item do checklist" } ], "total": 1 }
```
Cada item de `rows` é uma linha da tabela `checklist_items`: `id`, `protocol_id`, `item_type` (`equipment`, `ip_vlan` ou `client_contact`), `is_required`, `is_done`, `completed_at`, `completed_by` e `created_at`. `total` é o número de itens retornados (`rows.length`); não há paginação.

**Respostas**

| Código | Situação |
|--------|----------|
| 200    | Lista de itens do checklist (vazia, `{ "rows": [], "total": 0 }`, se o protocolo não tem itens) |
| 400    | `id` fora do formato UUID |
| 401    | Token ausente, inválido ou expirado |
| 404    | Protocolo não encontrado |
| 500    | Erro interno |

A criação de itens pela API ainda não existe (POST e PATCH do checklist estão pendentes); enquanto isso a lista volta vazia na prática, e o smoke aceita lista vazia.

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
