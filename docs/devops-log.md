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
