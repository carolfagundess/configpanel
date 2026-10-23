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

---

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

---

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

---

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

---

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

---

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

---

## [2026-09-18] Deploy manual (comparação DevOps-6)

Deploy manual do backend na EC2 após push da imagem nova pro ECR (DevOps-5 parte 1).

**Passos executados:**
1. Conexão SSH na EC2 via chave `.pem` local
2. `docker login` no ECR (via `aws sts get-caller-identity` pra obter Account ID)
3. `docker pull` da imagem `:latest` — 8 camadas baixadas do zero
4. Reconstrução do comando `docker run` original via `history | grep "docker run"` (não havia `.env` documentado — variáveis foram passadas via `-e` na criação original)
5. `docker stop` + `docker rm` do container antigo
6. `docker run` do container novo com as mesmas env vars
7. Validação: `docker ps` + `docker logs` confirmando conexão ao PostgreSQL

**Observações relevantes para a comparação manual vs. automatizado:**
- Não houve erro de execução nos comandos Docker/AWS em si
- O maior tempo gasto foi em **descoberta de contexto**, não em execução: localizar a chave SSH `.pem` local e reconstruir o comando `docker run` original (que dependia de memória/histórico do bash, não de documentação)
- Isso evidencia uma fragilidade do processo manual: depende de conhecimento tácito do operador, não está formalizado em nenhum artefato versionado
- **Timestamps não foram registrados nesta execução** — ponto de atenção para a próxima medição

---

## [2026-09-18] DevOps-5 parte 2: Deploy automático via SSH (setup)

Configuração do job de deploy automático na EC2, encadeado após o push da imagem para o ECR.

**Decisão de segurança — chave SSH dedicada:**
Gerado par de chaves exclusivo para o GitHub Actions (`ssh-keygen -t ed25519`, sem passphrase),
separado da chave pessoal (`configpanel-key.pem`). Segue o mesmo princípio de menor privilégio
já aplicado ao usuário IAM `github-actions-deploy` (DevOps-5 parte 1): credencial do robô
isolada da credencial humana, permitindo revogação independente.

**Passos executados:**
1. Chave pública (`github-actions-deploy-key.pub`) adicionada ao `~/.ssh/authorized_keys` da EC2
2. Conexão validada manualmente com a chave nova antes de configurar o GitHub
3. Confirmado via `aws configure list` que as credenciais AWS na EC2 estão persistidas em
   `~/.aws/credentials` (shared-credentials-file), não em variáveis de ambiente temporárias —
   portanto sobrevivem a novas sessões SSH, incluindo as abertas pelo GitHub Actions
4. Dois novos secrets criados no repositório GitHub: `EC2_HOST` e `EC2_SSH_PRIVATE_KEY`
5. Novo job `deploy-to-ec2` adicionado ao `ci.yml` (`needs: push-to-ecr`), usando a action de
   terceiro `appleboy/ssh-action@v1.0.3` (não há forma nativa de rodar SSH interativo direto
   num job do Actions)
6. O job executa via SSH a mesma sequência do deploy manual: login no ECR, `docker pull`,
   stop/rm/run

## [2026-09-24] DevOps-5 parte 2: Deploy automático via SSH (execuções e validação)

Continuação da entrada de 18/09. O job `deploy-to-ec2` rodou três vezes no PR #3: duas falharam por configuração e a terceira passou.

**Execução 1 (19/09), falha: `ssh.ParsePrivateKey: ssh: no key found`.** A chave privada do secret `EC2_SSH_PRIVATE_KEY` perdeu a formatação ao ser copiada por seleção de texto no terminal. Correção: copiar o arquivo direto para a área de transferência (`Get-Content $HOME\.ssh\github-actions-deploy-key -Raw | Set-Clipboard`) e atualizar o secret.

**Execução 2 (24/09), falha: `dial tcp ***:22: i/o timeout`.** Com a chave aceita, a conexão nem abria: o Security Group `configpanel-sg` liberava a porta 22 só para o IP doméstico, e o runner do GitHub Actions usa outros IPs. Correção: nova regra SSH com origem `0.0.0.0/0` (aceitável no ambiente de estudo; a autenticação continua dependendo da chave). Na primeira tentativa a regra restrita foi sobrescrita por engano em vez de ganhar uma regra nova. Foi restaurada como regra separada, com o IP atual. Security Group final: 5 regras de entrada.

**Execução 3 (24/09), sucesso.** Job `deploy-to-ec2` concluído em 25s (run do PR, evento pull_request; no run de main disparado pelo merge, mais tarde no mesmo dia, o job levou 22s) ("Successfully executed commands to all host") e os 4 jobs verdes. Validação funcional via Postman contra `http://<IP_DA_EC2>:3001`:
- `GET /protocols/` sem token → 401 "Token inválido ou expirado" (proteção de rota ativa após o deploy)
- `POST /auth/login` → 200 OK com token JWT

PR #3 mergeado na `main` em 24/09 às 18:10 UTC.

**Nota metodológica (DevOps-6).** O tempo desta primeira configuração não é comparável a um deploy manual isolado: atravessou vários dias e incluiu problemas de infraestrutura que só aparecem na prática (formato da chave, regras de rede). A métrica válida é o tempo de execução recorrente do pipeline já configurado contra o de um deploy manual recorrente. Os 25s são a duração do job de deploy, não do pipeline fim a fim; o DevOps-6 precisa definir o intervalo medido (por exemplo, do push na `main` até o container respondendo).

## [2026-10-04] DevOps-5 parte 2: Deploy restrito à main e primeira medição limpa

**Problema encontrado.** Os jobs `push-to-ecr` e `deploy-to-ec2` não tinham condição de branch, então rodavam também em eventos `pull_request`. Na prática, qualquer PR sobrescrevia a tag `latest` no ECR e reimplantava a EC2 com código ainda não revisado (foi o que aconteceu no PR #3, antes do merge).

**Correção (PR #4).** `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` nos dois jobs. No próprio PR, `test-backend` (31s) e `build-docker` (14s) passaram e `push-to-ecr` e `Deploy to EC2` ficaram skipped. Depois do merge, o run na `main` executou os 4 jobs com sucesso, então a condição não bloqueia o fluxo real.

**Medição (runs de push na `main`: 36039412142 e 37245387841):**

| Job | Run 24/09 (merge PR #3) | Run 04/10 (merge PR #4) |
|---|---|---|
| test-backend | 40s | 43s |
| build-docker | 13s | 10s |
| push-to-ecr | 22s | 24s |
| Deploy to EC2 | 22s | 24s |
| Soma dos jobs | 97s | 101s |
| Run completo | 1m49s | 1m51s |

Run 24/09: id 36039412142. Run 04/10: id 37245387841, merge às 23:53:36 UTC, com 1m52s do merge ao fim do último job. O deploy levou 22s a 25s nas três execuções de 24 e 04/10. Observação: são duas amostras de run completo na main; para o DevOps-6 é preciso definir o intervalo medido e coletar mais execuções.

## [2026-10-06] Auditoria e atualização da documentação do repositório

**Fase da trilha:** Transversal (documentação, apoio ao DevOps-6)
**Contexto:** revisão dos arquivos Markdown contra o estado real do código e do pipeline, antes de iniciar a coleta de métricas do DevOps-6.
**O que foi feito:** conferidos `api-endpoints.md` (rotas, erros e FSM) e `README.md` contra controllers, router, state machine, migrations e `ci.yml`. Encontrados `docs/adr/api.md` e `docs/adr/erd.md` vazios e o `frontend/README.md` ainda como template do Vite. Ações: `erd.md` preenchido (diagrama Mermaid, regras no banco, observações) e movido para `docs/erd.md`, já que `docs/adr/` não continha nenhum ADR; `api.md` removido (o contrato vigente é o `api-endpoints.md`); `frontend/README.md` reescrito com o estado real; criado `docs/deploy.md` (infraestrutura, secrets, passos do deploy e limitações); README ajustado para informar que push no ECR e deploy só rodam na `main`.
**Evidência:** commit desta entrada na branch `docs/auditoria-documentacao`.
**Observações:** a revisão expôs lacunas de código registradas como limitações, não corrigidas: `protocol_history.changed_by` nunca é preenchido; credenciais de produção em texto no `ci.yml`; deploy sem health check ou rollback; migrations fora do pipeline; frontend ainda não consome a API.

## [2026-10-06] Segredos fora do ci.yml, health check no deploy e rotação de credenciais

**Fase da trilha:** DevOps-5 parte 2 — Deploy automático (endurecimento)
**Contexto:** a auditoria de 06/10 registrou que `DB_USER`, `DB_PASSWORD` e `JWT_SECRET` de produção estavam escritos em texto no `ci.yml`. Confirmado que o repositório é **público**, então esses valores estiveram expostos no histórico do Git, e não apenas no arquivo atual.
**O que foi feito:**
- PR #6: o deploy passou a ler `DB_USER`, `DB_PASSWORD` e `JWT_SECRET` de GitHub Secrets, ganhou `script_stop: true` e um step final que consulta `/health` com `curl --fail` e retentativas.
- Rotação: como os valores antigos continuam no histórico, foram considerados comprometidos e substituídos por valores novos nos Secrets. Trocar o Secret não altera a senha dentro do Postgres, que também precisou ser trocada.
- O run #18 ficou **verde com a senha do banco divergente** (Secret novo, Postgres com a senha antiga). O `/health` não consulta o banco, então o step só provou que o processo da API respondia; o erro só apareceria no login. Correção: `ALTER USER` no Postgres com o valor lido do container da API, alinhando banco e Secret.
- Segunda rotação do `DB_PASSWORD`, trocando a senha também dentro do Postgres.
**Evidência:** PR #6; run #18 do GitHub Actions (verde com credencial divergente); run 37546243209 (abaixo).
**Métrica (se aplicável):** run 37546243209, push na `main` em 06/10: 1m53s no total. Terceira amostra de run completo (as anteriores: 1m49s em 24/09 e 1m51s em 04/10). Esse run é do merge do PR #5 (commit `bae98d0`), anterior ao PR #6, então não tem o step de `/health`: as três amostras preliminares (24/09, 04/10 e 06/10) são todas sem health check. O step só aparece a partir do run #18, que não conta como amostra porque terminou verde com a senha do banco divergente. Continua preliminar: o intervalo medido do DevOps-6 ainda não está definido.
**Observações:** (1) `script_stop: true` e o step de `/health` pegam falhas de comando e de processo, mas não de credencial do banco. Um check que toque o banco (por exemplo, `/health` com `SELECT 1`, ou um login de teste) continua pendente. (2) Segredos que já estiveram em repositório público devem ser tratados como vazados; reescrever o histórico não resolve, a rotação é o que vale. (3) Nenhum valor de segredo é registrado neste log.

## [2026-10-07] PR #7 mergeado, primeiro run com health check validado e proposta do método da PoC

**Fase da trilha:** Transversal (documentação e preparação do DevOps-6)
**Contexto:** fechar a auditoria da documentação e registrar a primeira medição do pipeline já com o step de `/health`, antes da orientação de 08/10. Horários em Brasília (UTC-3).
**O que foi feito:**
- PR #7 (auditoria da documentação, `deploy.md` e registro da rotação de segredos) validado e mergeado às ~20:58, commit `9e9ed9b`. Antes do merge, `test-backend` e `build-docker` passaram e `push-to-ecr` e `Deploy to EC2` ficaram skipped, como esperado em PR.
- Run da `main` #21 (id 37705220239), disparado pelo merge: início 20:58:22, fim 21:00:11, **1m49s**. Os 4 jobs concluíram com sucesso; o step "Valida que a API respondeu" passou.
- Método da PoC proposto em `docs/metodo-poc.md`: deploy manual vs. pipeline, com o DORA adaptado, métricas por timestamps, comandos e intervenções. Fica como proposta a validar com a orientadora na orientação de 08/10.
**Evidência:** PR #7; run 37705220239.
**Métrica (se aplicável):** run 37705220239: test-backend 37s, build-docker 15s, push-to-ecr 22s, Deploy to EC2 26s, run completo 1m49s. Amostra preliminar nº 4 (anteriores: 24/09, 04/10 e 06/10). É a primeira com o step de health, mas o `/health` ainda não consulta o banco, então a amostra segue preliminar e fora das amostras oficiais da PoC.
**Observações:** login validado pelo script de smoke (ver entrada abaixo). O check que toca o banco continua pendente (ver entrada de 06/10).

## [2026-10-07] Ensaio da PoC, script de smoke e conta de teste

**Fase da trilha:** Transversal (preparação do DevOps-6)
**Contexto:** fechar o método da PoC e o script de smoke, e ensaiar o fluxo merge, pipeline e smoke antes das coletas oficiais. Horários em Brasília (UTC-3).
**O que foi feito:**
- PR #8 (método v1.1, `docs/metodo-poc.md`) e PR #9 (`scripts/smoke.ps1`) mergeados.
- Runs da `main`: #24 (id 37713239762, commit `23b6763`, criado 22:30:11, 1m38s) e #26 (id 37714902588, commit `10b5193`, criado 22:50:23, terminou 22:52:04, 1m41s; jobs: test-backend 33s, build-docker 9s, push-to-ecr 21s, Deploy to EC2 28s).
- Conta de teste `smoke.teste` criada no Postgres da EC2, porque a API não tem rota de cadastro. Nenhuma senha foi gravada no repositório.
- Ensaio (fora das amostras oficiais): merge às 22:50:22; último 200 do smoke às 22:52:21,5; tempo do run criado até o smoke OK ≈ 1m59s; 0 falhas. O smoke manual no fim inclui ~17 s de espera humana.
**Evidência:** PR #8; PR #9; runs 37713239762 e 37714902588.
**Métrica (se aplicável):** run 37714902588: 1m41s (jobs: 33s / 9s / 21s / 28s); do run criado até o smoke OK ≈ 1m59s. Run 37713239762: 1m38s. Ambos são ensaio e ficam fora das amostras oficiais.
**Observações:** (1) o `/health` ainda não consulta o banco (M3b). (2) Os comandos de verificação (variáveis de ambiente, atualização do repositório) são contados à parte dos de deploy. (3) O ensaio manual ainda está pendente. (4) Nenhuma senha ou token é registrado neste log.

## [2026-10-11] PR #10 mergeado sem [skip ci]: run #34 fora da PoC

**Fase da trilha:** Transversal (preparação do DevOps-6)
**Contexto:** registrar um erro de procedimento no merge do PR #10 e o que fica por repetir. Horários em Brasília (UTC-3).
**O que foi feito:**
- O PR #10 foi mergeado sem `[skip ci]` por erro de procedimento. O merge gerou o run #34 na `main` (commit `5738138`), com deploy na EC2.
- Esse run **não é amostra da PoC**.
- O teste do `[skip ci]` será repetido com o próximo merge só de documentação.
**Evidência:** PR #10; run #34 (commit `5738138`).
**Métrica (se aplicável):** não se aplica; run fora das amostras da PoC.
**Observações:** nenhum valor de segredo é registrado neste log.

## [2026-10-12] PRs #15, #16 e #17 mergeados; runs #38 e #40; decisões de 08/10 e 11/10

**Fase da trilha:** Transversal (preparação do DevOps-6)
**Contexto:** registrar os merges de 12/10 (UTC) e as decisões da orientação (08/10) e do ensaio (11/10), antes de congelar o ambiente e começar as coletas. Horários em UTC.
**O que foi feito:**
- PR #15 (`ci: restringe permissões, serializa o deploy e usa o environment production`): `permissions: contents: read`, `environment: production` e `concurrency` (`deploy-prod`, sem cancelar) no job de deploy. Merge às 01:18 UTC, commit `ee8b787`. **Run #38** (id 38191387080).
- PR #16 (`docs: adiciona o roteiro manual final e a ficha de coleta da PoC`): merge às 01:23 UTC, commit `12d7490`, com a flag de pular CI no título do squash, digitada à mão. **Não gerou run**, o que confirma o teste que estava pendente na entrada de 11/10.
- PR #17 (`ci: smoke aceita qualquer 2xx, informa chamadas_2xx e horário de fim`): merge às 01:40 UTC, commit `c77fdaa`. **Run #40** (id 38192782924). O run #39 (id 38192690494) é o do PR, antes do merge, sem deploy.
- Decisões registradas em `docs/metodo-poc.md` (v1.2, seção 1.1): pergunta norteadora aprovada em 08/10; escopo só de eficiência e qualidade; leitura B (cada amostra é um incremento real de código); molde de "uma rota nova" (model, controller e router, no mínimo 3 testes Jest, 1 passo no smoke, sem migration); opção 4 (merge com a flag de pular CI no título do squash e deploy manual a partir da main, no commit do merge); smoke aceita qualquer 2xx; congelamento do ambiente, não do código da API.
- Limitação registrada: o `Pool` do `pg` não define `connectionTimeoutMillis`.
**Evidência:** PRs #15, #16 e #17; runs #38 e #40.
**Métrica (se aplicável):** os dois runs são **fora das amostras da PoC** (anteriores ao congelamento do ambiente).

| Job | Run #38 (merge PR #15) | Run #40 (merge PR #17) |
|---|---|---|
| test-backend | 37s | 38s |
| build-docker | 15s | 16s |
| push-to-ecr | 26s | 15s |
| Deploy to EC2 | 31s | 26s |
| Smoke test | 8s | 12s |
| Run completo (criação ao fim) | 2m11s | 1m58s |

Run #38: criado 01:18:37, fim 01:20:48. Run #40: criado 01:40:14, fim 01:42:12. Os dois terminaram com sucesso nos 5 jobs, com o job de smoke como último.
**Observações:** (1) o run #38 é o primeiro com `environment: production`; o tempo total maior inclui a espera entre jobs e não deve ser lido como regressão. (2) Nenhum valor de segredo é registrado neste log.

## [2026-10-12] PR #19, proteção da main, PR #20, pg_dump e piloto manual

**Fase da trilha:** Transversal (preparação do DevOps-6)
**Contexto:** registrar o que ocorreu em 12/10 depois dos PRs #15 a #17, antes das coletas oficiais. Horários em BRT, salvo indicação.
**O que foi feito:**
- PR #19: `scripts/coleta-pipeline.ps1`, que gera a linha da ficha a partir de um run do pipeline. Testado nas runs #38 e #40.
- Proteção da main: ruleset `proteger-main`, criado às 13:33, com 4 regras (PR obrigatório, checks `test-backend` e `build-docker`, bloqueio de force push, bloqueio de exclusão), sem bypass.
- PR #20: a validade do token JWT lê `JWT_EXPIRES_IN`, com padrão 8h. 2 arquivos, +64 -3, 4 testes novos (183 -> 187). Merge às 13:59:59 com `[skip ci]`, sem execução do pipeline.
- `pg_dump` de 12/10 às 13:39 (`-Fc`, 20462 bytes, 55 itens), guardado fora do repositório.
- Piloto manual (descartado, não é amostra): 20 comandos (15 + 5 extras), 3 intervenções, 1 dado sensível. Do merge (13:59:59) ao fim do smoke (14:07:10) = 431 s.
- Treino manual às 21:04 (não é amostra): 15 comandos D, 0 extras, 0 intervenções, 254 s de A1 ao fim do smoke (o piloto levou 365 s no mesmo trecho).
**Evidência:** PRs #19 e #20; runs #38 e #40; ruleset `proteger-main`; dump `-Fc` fora do repositório.
**Métrica (se aplicável):** piloto 431 s (merge ao fim do smoke); treino 254 s (A1 ao fim do smoke). Nenhum dos dois entra nas 10 amostras.
**Observações:** (1) o treino e o piloto alimentam o efeito de prática descrito em `docs/metodo-poc.md` (seção 9). (2) Nenhum IP nem ID de conta AWS é registrado neste log.

## [2026-10-15] Amostra 1 (pipeline): PR #23, run #54 e smoke com escrita real

**Fase da trilha:** Transversal (DevOps-6, coleta da PoC)
**Contexto:** registrar a primeira amostra da modalidade pipeline: o incremento `POST /protocols/:id/ips` (RF07) e o passo 4 do smoke. Horários em BRT, salvo indicação.
**O que foi feito:**
- PR #23 mergeado: commit de merge `5b37881` às 22:24:54, **sem** `[skip ci]` (amostra de pipeline).
- Run #54 (id 38834988650): 5 jobs com sucesso. **120 s** do commit de merge ao fim do smoke (fim do smoke às 22:26:54,2).
- O smoke passou a ter **4 chamadas**. A 4ª é uma **escrita real**: `POST /protocols/<id>/ips` com `192.0.2.1` (faixa RFC 5737, reservada para documentação) e categoria `gerencia`, no protocolo dedicado `SMOKE-0001` / "SMOKE TESTE". O smoke acha o protocolo pelo nome em `GET /protocols?limit=200` e falha com mensagem clara se não achar.
- Decisão: **escrita real, sem `dry_run`** (opção descartada: parâmetro `dry_run`).
- O protocolo "SMOKE TESTE" foi criado em produção, via API, em 15/10 por volta de 22:22. É a **única alteração de dados em produção**; não houve novo segredo nem variável de ambiente.
- As linhas em `ips` **acumulam** a cada execução do smoke e serão removidas por SQL ao fim da coleta.
- `scripts/smoke.ps1` foi alterado de propósito (smoke cumulativo: cada amostra acrescenta 1 passo). O hash congelado antigo (`1d7fee9`) **deixa de valer**. O novo é `5b37881`, obtido com `git log -1 --format=%h -- scripts/smoke.ps1`.
- Homologação local feita pela autora antes do merge: 192 testes Jest, smoke duas vezes seguidas e erros 400/401/404 cobertos.
**Evidência:** PR #23; commit `5b37881`; run #54 (id 38834988650); linha `1` de `docs/ficha-coleta.csv`.
**Métrica (se aplicável):** tempo_total_s = 120 (commit de merge ao fim do smoke); 4 chamadas 2xx; 5 arquivos alterados, 206 linhas alteradas, 5 testes novos.
**Observações:** (1) o smoke cumulativo muda dados de produção de forma controlada (ver `docs/metodo-poc.md`, seção 1.1). (2) Nenhum IP real da EC2 nem valor de segredo é registrado neste log.

## [2026-10-16] Amostra 2 (manual): PR #25, GET /protocols/:id/ips e desvios do roteiro

**Fase da trilha:** Transversal (DevOps-6, coleta da PoC)
**Contexto:** registrar a segunda amostra, a primeira da modalidade manual: o incremento `GET /protocols/:id/ips` (RF07) e o passo 5 do smoke. Horários em BRT, salvo indicação.
**O que foi feito:**
- PR #25 mergeado: commit de merge `6a6e5ac`, com `[skip ci]` (sem execução do pipeline; o deploy foi manual).
- Amostra 2 (manual), iniciada às 21:58:30 (A1, 69 s após o commit de merge, pela leitura do SHA): **393 s** do início ao fim do smoke (22:05:02,9), **19 comandos**, **4 intervenções**, 1 dado sensível manual. O smoke passou a ter **5 chamadas**, todas 2xx.
- Build do Docker em 1 s (camadas em cache).
- 5 arquivos alterados, 103 linhas alteradas, 4 testes novos.
- Desvios do roteiro: (1) referência de relógio **a.ntp.br**, além de time.windows.com, medida antes e depois da amostra; (2) **w32time parado** durante a amostra; (3) relógio do PC **corrigido por `Set-Date`** às 21:10; (4) `EC2_IP` sem aspas no preparo (Id 7); (5) o `ssh` falhou 2 vezes com host vazio (Ids 23-24, o 23 conta como A15), seguidos de redefinição da variável (Id 25) e `ssh` ok (Id 26); (6) typo `smoke.ps` sem o 1 (Id 28). Um comando solto de `ssh` na janela de administrador ficou fora do histórico do deploy e não foi contado.
- Correção de relógio: desvio de -0,0506 s antes (21:55:25) e -0,068 s depois (22:07:44), média -0,059 s (negativo = PC adiantado). Tempo bruto 392,946 s, corrigido 392,89 s.
**Evidência:** PR #25; commit `6a6e5ac`; linha `2` de `docs/ficha-coleta.csv`.
**Métrica (se aplicável):** tempo_total_s = 393 (392,89 s corrigido); 19 comandos; 4 intervenções; 5 chamadas 2xx.
**Observações:** (1) o desvio do relógio varia de dia para dia e passou a ser medido por amostra (ver `docs/metodo-poc.md`). (2) Nenhum IP real da EC2, ID de conta AWS nem valor de segredo é registrado neste log.

## [2026-10-16] Amostra 3 (pipeline): PR #27, run #60 e GET /protocols/:id/equipamentos

**Fase da trilha:** Transversal (DevOps-6, coleta da PoC)
**Contexto:** registrar a terceira amostra, a segunda da modalidade pipeline: o incremento `GET /protocols/:id/equipamentos` e o passo 6 do smoke. Horários em BRT, salvo indicação.
**O que foi feito:**
- PR #27 mergeado: commit de merge `06378b7` às 22:37:23, **sem** `[skip ci]` (amostra de pipeline). Atraso entre o merge e o início do run: 3 s.
- Run #60 (id 38991651375): 5 jobs com sucesso. **112 s** do commit de merge ao fim do smoke (fim do smoke às 22:39:15,0).

| Job | Duração |
|-----|---------|
| test-backend | 35 s |
| build-docker | 14 s |
| push-to-ecr | 16 s |
| Deploy to EC2 | 24 s |
| Smoke test | 12 s |

- O smoke passou a ter **6 chamadas**, todas 2xx. A 6ª é `GET /protocols/<id>/equipamentos`, no protocolo `SMOKE TESTE`.
- 5 arquivos alterados, 152 linhas alteradas (+149 -3), 5 testes novos (201 no total).
- Homologação local pelo Postman. O primeiro GET devolveu **404 do Express**: o container do backend (imagem `node:24-alpine` com a pasta montada) estava com o código antigo carregado e foi preciso `docker-compose restart backend`. Depois do restart, a rota devolveu 200 `{rows:[],total:0}`.
- `scripts/smoke.ps1` foi alterado de propósito (smoke cumulativo: cada amostra acrescenta 1 passo). O hash congelado passa a ser `06378b7`, obtido com `git log -1 --format=%h -- scripts/smoke.ps1`.
**Evidência:** PR #27; commit `06378b7`; run #60 (id 38991651375); linha `3` de `docs/ficha-coleta.csv`.
**Métrica (se aplicável):** tempo_total_s = 112 (commit de merge ao fim do smoke); 6 chamadas 2xx; 5 arquivos alterados, 152 linhas alteradas, 5 testes novos.
**Observações:** (1) o 404 da homologação veio de código antigo carregado no container, não da rota; a lição é reiniciar o backend após mudar o código montado. (2) Nenhum IP real da EC2, ID de conta AWS nem valor de segredo é registrado neste log.

## [2026-10-17] Amostra 4 (manual): PR #29, POST /protocols/:id/equipamentos e typo npm instal

**Fase da trilha:** Transversal (DevOps-6, coleta da PoC)
**Contexto:** registrar a quarta amostra, a segunda da modalidade manual: o incremento `POST /protocols/:id/equipamentos` (RF08) e o passo 7 do smoke. Horários em BRT, salvo indicação.
**O que foi feito:**
- PR #29 mergeado: commit de merge `ad4ef17` às 09:14:21, com `[skip ci]` (sem execução do pipeline; o deploy foi manual). Confirmado: nenhum run de push em main; o run #62 é só do PR.
- Amostra 4 (manual), iniciada às 09:14:21 (A1, 30 s após o commit de merge): **225 s** do início ao fim do smoke (09:18:05,9), **15 comandos**, **0 intervenções**, 1 dado sensível manual. Sem erros nem retentativas. O smoke passou a ter **7 chamadas**, todas 2xx (7/7).
- Build do Docker em 3 s (camadas em cache).
- PR com 5 arquivos alterados, 261 linhas alteradas (+258 -3), 8 testes novos (209 no total).
- Typo `npm --prefix backend instal` no A5: o npm aceitou o alias, sem efeito; contado como comando do tipo P.
- Correção de relógio (a.ntp.br; negativo = PC adiantado): desvio de -0,190 s corrigido por `Set-Date` às 09:11, com w32time parado; medições de -0,0138 s antes (09:12:44) e -0,0092 s depois (09:21:47). Tempo corrigido 224,90 s.
**Evidência:** PR #29; commit `ad4ef17`; linha `4` de `docs/ficha-coleta.csv`.
**Métrica (se aplicável):** tempo_total_s = 225 (224,90 s corrigido); 15 comandos; 0 intervenções; 7 chamadas 2xx; 5 arquivos alterados, 261 linhas alteradas, 8 testes novos.
**Observações:** (1) o merge com `[skip ci]` não gera run de push em main, como esperado para a amostra manual. (2) Nenhum IP real da EC2, ID de conta AWS nem valor de segredo é registrado neste log.

## [2026-10-18] Amostra 5 (pipeline): PR #31, run #66 e POST /protocols/:id/comunicacoes

**Fase da trilha:** Transversal (DevOps-6, coleta da PoC)
**Contexto:** registrar a quinta amostra, a terceira da modalidade pipeline: o incremento `POST /protocols/:id/comunicacoes` (RF09) e o passo 8 do smoke. Horários em BRT, salvo indicação.
**O que foi feito:**
- PR #31 mergeado: commit de merge `90333c3` às 19:50:03, **sem** `[skip ci]` (amostra de pipeline). Atraso entre o merge e o início do run: 2 s.
- Run #66 (id 39173941886): 5 jobs com sucesso. **129 s** do commit de merge ao fim do smoke (fim do smoke às 19:52:11,5).

| Job | Duração |
|-----|---------|
| test-backend | 38 s |
| build-docker | 13 s |
| push-to-ecr | 23 s |
| Deploy to EC2 | 31 s |
| Smoke test | 10 s |

- O smoke passou a ter **8 chamadas**, todas 2xx (8/8, `chamadas_2xx=8`).
- 5 arquivos alterados, 170 linhas alteradas (+167 -3), 6 testes novos (215 no total).
- `image_version` 20261012.334.1.
- Homologação local antes do merge pelo Postman (201/400/404/401) e smoke local 8/8.
**Evidência:** PR #31; commit `90333c3`; run #66 (id 39173941886); linha `5` de `docs/ficha-coleta.csv`.
**Métrica (se aplicável):** tempo_total_s = 129 (commit de merge ao fim do smoke); 8 chamadas 2xx; 5 arquivos alterados, 170 linhas alteradas, 6 testes novos.
**Observações:** Nenhum IP real da EC2, ID de conta AWS nem valor de segredo é registrado neste log.

## [2026-10-18] Amostra 6 (manual): PR #33, GET /protocols/:id/comunicacoes e dois erros digitados

**Fase da trilha:** Transversal (DevOps-6, coleta da PoC)
**Contexto:** registrar a sexta amostra, a terceira da modalidade manual (2, 4 e 6): o incremento `GET /protocols/:id/comunicacoes` (RF09) e o passo 9 do smoke. Horários em BRT, salvo indicação.
**O que foi feito:**
- PR #33 mergeado: commit de merge `0e7db0e` às 21:55:06, com `[skip ci]` no fim do título do diálogo do squash (sem execução do pipeline; o deploy foi manual). Confirmado por `git log` e `gh run list`: nenhum run de push em main. O diálogo do squash não foi fotografado.
- Amostra 6 (manual), iniciada no commit de merge (precisão de 1 s): **222 s** até o fim do smoke (21:58:47,807 bruto; 21:58:47,729 corrigido), **17 comandos**, **2 intervenções**, 1 dado sensível digitado. O smoke passou a ter **9 chamadas**, todas 2xx (9/9).
- Os 17 comandos são os 15 do conjunto D mais 2 extras de erros digitados: uma variável de ambiente do PowerShell colada dentro da sessão SSH (`command not found`) e um `docker logs` com nome de container truncado (`configpanel-backen`).
- PR com 5 arquivos alterados, 171 linhas alteradas (+167 -4), 6 testes novos (221 no total).
- Correção de relógio (a.ntp.br; negativo = PC adiantado): offset médio de -0,0783 s, com medições de -0,0815 s antes (cerca de 21:51) e -0,0751 s depois (cerca de 22:04, cerca de 5 min após o fim do smoke). Diferente de 16/10 e 17/10, o `w32time` **não foi parado**; foi feita uma ressincronização às 21:51.
**Evidência:** PR #33; commit `0e7db0e`; linha `6` de `docs/ficha-coleta.csv`.
**Métrica (se aplicável):** tempo_total_s = 222 (221,729 s corrigido); 17 comandos; 2 intervenções; 9 chamadas 2xx; 5 arquivos alterados, 171 linhas alteradas, 6 testes novos.
**Observações:** (1) o merge com `[skip ci]` não gera run de push em main, como esperado para a amostra manual. (2) Com o `w32time` em execução, o relógio pode ser ajustado durante a medição; o efeito é limitado pelas duas medições (antes e depois), que diferem em 0,0064 s. (3) Nenhum IP real da EC2, ID de conta AWS nem valor de segredo é registrado neste log.

## [2026-10-23] Amostra 7 (pipeline): PR #35, GET /protocols/:id/checklist

**Fase da trilha:** Transversal (DevOps-6, coleta da PoC)
**Contexto:** registrar a sétima amostra, a quarta da modalidade pipeline: o incremento `GET /protocols/:id/checklist` (RF10) e o passo 10 do smoke. Horários em BRT, salvo indicação.
**O que foi feito:**
- PR #35 mergeado: commit de merge `5f86872` às 15:23:34, **sem** `[skip ci]` (amostra de pipeline). Atraso entre o merge e o início do run: 4 s.
- Run #72 (id 40002908272): 5 jobs com sucesso. **132 s** (131,6 s) do commit de merge ao fim do smoke (fim do smoke às 15:25:45,6). Sem relógio a corrigir: início e fim vêm do GitHub.

| Job | Duração |
|-----|---------|
| test-backend | 33 s |
| build-docker | 13 s |
| push-to-ecr | 28 s |
| Deploy to EC2 | 30 s |
| Smoke test | 11 s |

- O smoke passou a ter **10 chamadas**, todas 2xx (10/10, `chamadas_2xx=10`). O passo 10 é `GET /protocols/:id/checklist`; a lista vazia é aceita porque ainda não há POST de checklist.
- 5 arquivos alterados, 168 linhas alteradas (+165 -3), 6 testes novos (227 no total).
- `image_version` 20261012.334.1.
- O GitHub registrou 4 anotações sobre Node.js 20 deprecated nas ações (aviso, sem efeito no resultado do run).
**Evidência:** PR #35; commit `5f86872`; run #72 (id 40002908272); linha `7` de `docs/ficha-coleta.csv`.
**Métrica (se aplicável):** tempo_total_s = 132 (commit de merge ao fim do smoke); 10 chamadas 2xx; 5 arquivos alterados, 168 linhas alteradas, 6 testes novos.
**Observações:** Nenhum IP real da EC2, ID de conta AWS nem valor de segredo é registrado neste log.

## [2026-10-23] Amostra 8 (manual): PR #37, POST /protocols/:id/checklist

**Fase da trilha:** Transversal (DevOps-6, coleta da PoC)
**Contexto:** registrar a oitava amostra, a quarta da modalidade manual (2, 4, 6 e 8): o incremento `POST /protocols/:id/checklist` (RF10) e o passo 11 do smoke. Horários em BRT, salvo indicação.
**O que foi feito:**
- PR #37 mergeado: commit de merge `2b5660c` às 17:17:15, com `[skip ci]` no fim do título do squash (sem execução do pipeline; o deploy foi manual). Confirmado por `git log` e `gh run list`: nenhum run de push em main. O diálogo do squash não foi fotografado.
- Amostra 8 (manual), iniciada no commit de merge (precisão de 1 s): **266 s** (266,28) até o fim do smoke (17:21:41,278 corrigido), **15 comandos** (todos do conjunto D, nenhum extra), **1 intervenção** (a senha do smoke, 1 dado sensível digitado). O smoke passou a ter **11 chamadas**, todas 2xx (11/11); o passo 11 é `POST /protocols/:id/checklist` (201).
- PR com 5 arquivos alterados, 213 linhas alteradas (+208 -5), 7 testes novos (234 no total).
- Correção de relógio (a.ntp.br; negativo = PC adiantado): offset médio de -0,0166 s, com medições de -0,0111 s antes (cerca de 17:06, 11 min antes do merge) e -0,0221 s depois (cerca de 17:23). O relógio do PC estava 0,617 s atrasado e foi ajustado com `Set-Date` +0,617 s às 17:03:55, com o `w32time` parado.
**Evidência:** PR #37; commit `2b5660c`; linha `8` de `docs/ficha-coleta.csv`.
**Métrica (se aplicável):** tempo_total_s = 266 (266,28 s corrigido); 15 comandos; 0 extras; 1 intervenção; 11 chamadas 2xx; 5 arquivos alterados, 213 linhas alteradas, 7 testes novos.
**Observações:** (1) o merge com `[skip ci]` não gera run de push em main, como esperado para a amostra manual. (2) A primeira medição do offset foi feita 11 min antes do merge; o efeito é desprezível frente à diferença de 0,0110 s entre as duas medições. (3) Nenhum IP real da EC2, ID de conta AWS nem valor de segredo é registrado neste log.
