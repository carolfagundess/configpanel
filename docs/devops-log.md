# DevOps Log — ConfigPanel

Registro cronológico de todas as ações da Trilha DevOps (TCC — "DevOps no
Desenvolvimento de Software: Estudo de Caso com Docker, GitHub Actions e AWS
em um ISP"). Cada entrada documenta uma ação concreta, sua motivação, e a
evidência associada, servindo como fonte primária para os capítulos de
Resultados e Conclusões do TCC (Etapa 5 — Validação e Análise da metodologia).

Formato de cada entrada:

```
## [AAAA-MM-DD] Título curto da ação

**Fase da trilha:** DevOps-N — nome da fase
**Contexto:** por que essa ação foi feita agora
**O que foi feito:** descrição técnica objetiva
**Evidência:** link de commit / PR / workflow run / screenshot referenciado
**Métrica (se aplicável):** tempo, taxa de erro, etc — relevante para a PoC
**Observações:** dificuldades, decisões de design, o que ficou pendente
```

---

## [2026-08-31] Definição do recorte técnico e planejamento da Trilha DevOps

**Fase da trilha:** Planejamento (pré-DevOps-1)
**Contexto:** revisão do projeto de pesquisa do TCC para alinhar a construção
do software (Módulo Desk) com o recorte técnico exigido pela pesquisa
(Docker + GitHub Actions + AWS ECR/EC2), evitando reconstruir o projeto do
zero após o fato.
**O que foi feito:** definida abordagem híbrida — testes automatizados são
escritos junto de cada endpoint do sprint de produto (não numa trilha
separada), enquanto infraestrutura de pipeline (workflows CI/CD,
provisionamento AWS) roda como trilha paralela, sem numeração dos sprints
de produto. Definidas as fases DevOps-1 a DevOps-6:
  - DevOps-1: suíte de testes automatizados (Jest + Supertest)
  - DevOps-2: workflow de CI no GitHub Actions (roda testes a cada push)
  - DevOps-3: CI valida build da imagem Docker
  - DevOps-4: provisionamento AWS (ECR + EC2 + IAM + security group)
  - DevOps-5: workflow de CD (build → push ECR → deploy EC2 via SSH)
  - DevOps-6: PoC — coleta de métricas (tempo de deploy, taxa de erro),
    comparando fluxo manual vs. automatizado
**Evidência:** este documento; histórico de conversa do projeto.
**Observações:** o MVP do Módulo Desk (endpoints `POST/GET /protocols`,
Sprint 1 Dias 4–6) já é artefato suficiente para iniciar a trilha DevOps,
conforme a Etapa 3 da metodologia do TCC ("abordagem de Produto Mínimo
Viável"). Não é necessário aguardar o Módulo Desk completo.

---

## [2026-08-31] Registro retroativo — Containerização Docker (Sprint 0)

**Fase da trilha:** Pré-DevOps (registro retroativo — trabalho já realizado no
Sprint 0, antes da estruturação formal da Trilha DevOps em 31/08/2026)
**Contexto:** o Sprint 0 (Fundação) já entregou toda a base de conteinerização
do projeto, cronologicamente anterior à decisão de tratar DevOps como trilha
documentada à parte. Estas ações são registradas agora, de forma retroativa,
para que o TCC tenha o histórico completo da jornada de containerização
(Objetivo Específico 3 do TCC: "Implementar a conteinerização da aplicação
com Docker, assegurando a portabilidade e a paridade técnica entre os
ambientes").
**O que foi feito:**
  - Estruturação do `docker-compose.yml` orquestrando três serviços:
    `frontend`, `backend` e `postgres` (imagem `postgres:16-alpine`)
  - Definição do padrão de variáveis de ambiente por serviço: `env_file:`
    explícito em cada serviço, apontando para `backend/.env` (backend e
    postgres) e `frontend/.env` isolado (só `VITE_API_URL`) — decisão tomada
    após troubleshooting real de interpolação `${VAR}` quebrando quando o
    `.env` não estava na raiz do projeto (documentado na Seção 8 do
    `configpanel-contexto-projeto.md`)
  - Configuração de hot-reload via `nodemon` dentro do container do backend
  - Validação end-to-end: stack completa (frontend + backend + postgres)
    sobe via `docker compose up`, com login JWT revalidado já containerizado
    (Sprint 0, Dia 10 — Notion)
**Evidência:** commits do Sprint 0 no repositório (setup inicial,
docker-compose por serviço); Notion, Sprint 0 Día 2 ("Configurar Docker
Compose") e Día 10 ("Subir a stack completa via Docker Compose e revalidar
login containerizado"), ambos marcados Done.
**Observações:** este é o ponto de partida técnico sobre o qual a Trilha
DevOps (DevOps-2 em diante) será construída — o `docker-compose.yml` já
validado é pré-requisito direto para o DevOps-3 (CI validando `docker build`)
e para a futura containerização de produção rumo ao ECR/EC2 (DevOps-4/5).

---

## [2026-08-31] Registro retroativo — Bug de hot-reload do nodemon em bind mount Docker

**Fase da trilha:** Pré-DevOps (registro retroativo)
**Contexto:** durante os testes manuais do endpoint `POST /protocols` (Sprint
1, Dia 5), identificado que o `nodemon` dentro do container não detectava
alterações salvas no VS Code (host Windows/WSL), exigindo restart manual do
container a cada edição.
**O que foi feito:** diagnosticado como limitação conhecida de `fs.watch`
nativo não propagando eventos através de bind mounts Docker em
Windows/WSL. Correção proposta (ainda não aplicada em definitivo): usar
`nodemon --legacy-watch` (polling) no lugar do watch nativo. Contorno
temporário usado durante os testes do Dia 5: `docker compose restart
backend` manual após cada edição.
**Evidência:** log do terminal do container (`nodemon crashed / restarted`),
conversa de troubleshooting do Dia 5.
**Observações:** pendência técnica em aberto — aplicar `--legacy-watch` (ou
alternativa como `chokidar` com polling) antes de depender fortemente de
hot-reload em sessões de desenvolvimento futuras. Relevante citar no TCC
como exemplo real de fricção de paridade de ambiente (Seção 9.3.2 da
fundamentação teórica) resolvida via ajuste de configuração, não de infra.

---

<!-- Novas entradas abaixo, mais recentes no topo -->

## [2026-09-09] Correção de gap de segurança — authMiddleware em /protocols

**Fase da trilha:** Produto / Correção de gap (RN01-RN02)
**Contexto:** validação do cronograma via Git (07/09) identificou que as
rotas de /protocols não passavam pelo authMiddleware, violando RN01-RN02.
Adicionalmente, inspeção do código durante a correção revelou um bug real
em `auth.provider.js`: `verifyToken` capturava exceções do `jwt.verify` e
retornava `null` em vez de propagar o erro, fazendo o `authMiddleware`
nunca acionar seu bloco de rejeição — tokens inválidos ou expirados
passavam despercebidos.
**O que foi feito:**
  - Corrigido `verifyToken` para propagar o erro do `jwt.verify` (removido
    o try/catch que o engolia).
  - Aplicado `authMiddleware` em todas as rotas de `/protocols` (POST,
    GET, GET/:id, PATCH/:id).
  - Atualizados os 15 testes de `protocols.test.js` para gerar um token
    via `generateToken()` e enviá-lo em `Authorization: Bearer <token>`
    em cada requisição.
**Validação:** suíte automatizada — 15 testes, 2 suítes, passando com
autenticação real. Validação manual via Postman: sem token → 401 ("Token
não fornecido ou inválido"); token malformado → 401 ("Token inválido ou
expirado" — cenário que só passou a funcionar após a correção do
verifyToken); token válido → 200 com dados corretos.
**Observações:** bug de hot-reload do nodemon (já documentado em
31/08/2026) reincidiu durante a validação — `docker compose restart
backend` foi necessário para o código atualizado refletir no container.
Tarefa marcada Done no board Notion (Sprint 1, criada em 07/09/2026).

## [2026-09-09] Sprint 1, Dia 7 — PATCH /protocols/:id

**Fase da trilha:** Produto (Sprint 1, Dia 7 — RF16)
**Contexto:** implementação do endpoint de atualização de dados dinâmicos
do protocolo, com bloqueio de campos fixos (RN08-09) já resolvido na
camada de model (`Protocols.model.js`, função `update`).
**O que foi feito:** adicionada `updateProtocol` ao controller, tratando
os códigos de erro do model (`RN08_TOPOLOGY_IMMUTABLE`, `22P02`, `23514`);
registrada a rota `PATCH /protocols/:id` no router.
**Evidência:** 4 cenários validados manualmente via Postman (atualização
válida, bloqueio de topology, corpo vazio, campo não mapeado ignorado);
4 testes automatizados adicionados a `protocols.test.js` — suíte completa
em 15 testes, 2 suítes, todos passando.
**Observações:** identificado comportamento a revisitar — PATCH com apenas
campos não mapeados (ex.: `id`) retorna 200 sem alterar nada, sem avisar
que a atualização foi ineficaz. Não bloqueante para V1, mas vale nota para
o capítulo de discussão do TCC.

## [2026-09-02] Testes de integração para /protocols (DevOps-1)

**Fase da trilha:** DevOps-1 — suíte de testes automatizados
**Contexto:** expansão da suíte de testes além do `health.test.js` inicial,
cobrindo agora os endpoints reais do Aggregate Root `/protocols` (POST do
Dia 5 e GET/GET-by-id do Dia 6), conforme próximo passo apontado na entrada
anterior.
**O que foi feito:** criado `tests/protocols.test.js` cobrindo:
  - POST /protocols: criação válida (201), campos obrigatórios ausentes
    (400), Last Mile sem `delivery_method` violando RN10 (400),
    `protocol_number` duplicado (409).
  - GET /protocols: listagem com paginação (200, formato `{ rows, total }`),
    filtro por status (200), `limit` inválido (400).
  - GET /protocols/:id: busca por id existente (200), id inexistente (404),
    id em formato inválido (400).
**Validação:** `docker compose exec backend npm test` — 2 suítes, 11 testes,
todos passando, processo encerra limpo.
**Evidência:** `backend/tests/protocols.test.js`; saída do `npm test` acima.
**Observações:** cobertura dos endpoints GET /protocols, GET /protocols/:id
(Dia 6) e POST /protocols agora conta com validação manual (Postman) e
automatizada — cumprindo a metodologia híbrida definida em 31/08/2026.
Próximo passo: DevOps-2 — configurar workflow do GitHub Actions para rodar
essa suíte automaticamente a cada push/PR.

## [2026-09-02] Configuração inicial de testes automatizados (DevOps-1)

**Fase da trilha:** DevOps-1 — suíte de testes automatizados
**Contexto:** primeiro passo da trilha DevOps propriamente dita, após o
Módulo Desk já ter endpoints suficientes (`/health`, `/protocols`) para
servir de alvo de teste. Segue a decisão de 31/08 de escrever testes junto
de cada endpoint do sprint de produto.
**O que foi feito:** instalado Jest + Supertest (`npm install --save-dev
jest supertest`). Criado `tests/health.test.js` como primeiro teste de
integração, validando `GET /health` via Supertest contra o `app` do
Express (sem `listen()` real — depende da separação app.js/index.js feita
em 01/09). Como o projeto usa `"type": "module"`, o script de teste
precisou da flag experimental do Node: `"test": "node
--experimental-vm-modules node_modules/jest/bin/jest.js"`.
**Decisão:** testes rodam dentro do container Docker, não localmente.
Motivo: `DB_HOST=postgres` só resolve dentro da rede do Docker Compose;
rodar `npm test` localmente (fora do container) gera erro `ENOTFOUND
postgres`. Como a TCC já tem como escopo GitHub Actions (que também roda
testes em ambiente containerizado/efêmero), alinhar o fluxo de teste local
ao mesmo modelo evita retrabalho na configuração do pipeline de CI.
Comando de execução: `docker compose exec backend npm test` (requer
`docker compose up` já rodando).
**Bug corrigido:** pool de conexões do `pg` não era fechado ao final dos
testes, causando "Jest did not exit" e logs após o encerramento dos
testes. Corrigido com `afterAll(async () => { await pool.end(); })` —
padrão que deve ser replicado em todo arquivo de teste que toque o banco
(direta ou indiretamente via rotas/models).
**Evidência:** `docker compose exec backend npm test` executa limpo, sem
warnings, processo encerra sozinho.
**Observações:** próximo passo é escrever testes de integração para os
endpoints reais de `/protocols` (GET, POST) antes de avançar pro DevOps-2
(workflow do GitHub Actions).

## [2026-08-30] Sprint 1, Dia 6 — GET /protocols e GET /protocols/:id

**Fase da trilha:** Produto (Sprint 1, Dia 6 — RF14)
**Contexto:** implementação dos endpoints de listagem e busca de protocolos,
completando a leitura básica do Aggregate Root do Módulo Desk. O Dia 6
havia sido marcado como concluído no board de sprints anteriormente sem o
código ter sido de fato aplicado — corrigido nesta entrega.
**O que foi feito:** adicionadas as funções `listProtocols` (paginação via
`limit`/`offset` e filtro opcional por `status`) e `getProtocolById` ao
controller; registradas as rotas `GET /protocols` e `GET /protocols/:id`
no router. Tratamento de UUID malformado (código Postgres 22P02) incluído
em `getProtocolById`.
**Evidência:** commit e7a50fe12a6f5e2aa20d8efaffc1392b4d0f3d48, branch sprint-1/dia-6-get-protocols. 6
cenários de teste validados manualmente contra servidor real: listagem
básica, filtro por status, paginação com limit, busca por id válido,
404 para id inexistente, 400 para id malformado — todos passaram.
**Observações:** reincidência do bug de hot-reload do nodemon em bind
mount Docker (já registrado em entrada anterior) — foi necessário
`docker compose restart backend` manual para os testes refletirem o
código atualizado.

## [2026-09-01] Separação app.js / index.js (Passo 2)

**Ação:** Separado `backend/src/index.js` em dois arquivos:
- `app.js` — configuração do Express (middlewares, rotas), sem chamada a `listen()`.
- `index.js` — carrega `dotenv/config`, importa o `app` de `app.js` e executa `app.listen()`.

**Motivo:** O Supertest precisa importar a aplicação Express configurada sem disparar
`listen()` — caso contrário, cada execução de teste tentaria abrir uma porta real,
tornando os testes lentos e sujeitos a conflito de porta.

**Validação:** Backend reiniciado via `docker compose restart backend`; endpoint
`GET /health` testado manualmente via Postman, retornando `{ "status": "ok", "projeto": "ConfigPanel" }` — confirma que a separação não introduziu regressão.

**Próximo passo:** `npm install --save-dev jest supertest` no backend, para iniciar a
configuração da suíte de testes automatizados.

## [2026-09-09] Sprint 1, Dia 10 — Validação de persistência e ownership

**Fase da trilha:** Produto (Sprint 1, Dia 10 — Seção 14.2)
**Contexto:** revisão de fechamento do Sprint 1. Tabelas `ips` e `equipment`
já existiam desde a migration 001, com campo `ownership` (unifique/last_mile,
default unifique) e constraint CHECK — mas nunca haviam sido exercitadas.
Sem model/controller para essas entidades ainda (fora do escopo atual da
API), a validação foi feita diretamente no banco via psql.
**O que foi feito:** 3 testes via `docker compose exec postgres psql`:
  1. INSERT em `ips` sem informar `ownership` — confirma default `unifique`.
  2. INSERT em `ips` com `ownership = 'valor_invalido'` — confirma rejeição
     pela constraint `ips_ownership_check`.
  3. INSERT em `equipment` com `ownership = 'last_mile'` — confirma que a
     tabela aceita e persiste o valor alternativo corretamente.
**Evidência:** saída dos 3 comandos SQL, todos com o comportamento esperado.
**Observações:** Sprint 1 backend (Módulo Desk) está com o núcleo de
protocolos completo: models, migrations, CRUD de protocols (POST/GET/
GET-by-id/PATCH), auth aplicado, persistência de ips/equipment validada.
Dias 8–9 (grid B2B e formulário de abertura) são tarefas de frontend,
deliberadamente postergadas — não bloqueiam a trilha DevOps. Marcado Done
no board Notion.
