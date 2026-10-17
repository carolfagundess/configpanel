# Método da PoC — Deploy manual vs. pipeline (ConfigPanel)

Versão 1.2 — 12/10/2026 (horários de Brasília, UTC-3; horários do GitHub/EC2 aparecem em UTC e são rotulados)
Status: **validado com a orientadora em 08/10/2026** e ajustado após o ensaio manual de 11/10/2026 (ver 1.1).

Mudança da v1.1 para a v1.2: pergunta norteadora aprovada em 08/10; escopo reduzido a eficiência e qualidade; cada amostra passa a ser um incremento real de código (leitura B), seguindo um molde fixo; merge das coletas com " skip ci" no título e deploy manual a partir da main (opção 4); o smoke aceita qualquer 2xx; o congelamento vale para o ambiente, não para o código da API.

Mudança da v1.0 para a v1.1: o "tempo ativo do operador" foi retirado do critério (depende da anotação da própria operadora e é passível de erro ou manipulação). Entraram métricas registradas pelo sistema: tempo total por timestamps, nº de comandos, nº de intervenções manuais e nº de dados sensíveis manipulados à mão. O teste de falha (c) passou a ser tratado como **detecção**, e não como bloqueio (ver 4.3).

## 1. Pergunta e hipótese

**Pergunta norteadora (aprovada em 08/10):**
Em que medida a adoção de práticas DevOps (Docker, GitHub Actions e AWS) melhora a entrega de software do ConfigPanel, em comparação com o processo manual?

**Hipótese:** o pipeline reduz o esforço manual e os erros e barra código quebrado antes da produção. O tempo total pode ficar parecido.

"Melhor" é multicritério e foi desdobrado em quatro eixos. **Escopo decidido em 08/10: a comparação cobre apenas os eixos 1 (eficiência) e 2 (qualidade).** Os eixos 3 e 4 ficam fora da comparação; o checklist da seção 4.4 é material complementar, descritivo.

| Eixo | Sub-pergunta |
|---|---|
| 1. Eficiência | O pipeline entrega mais rápido e com menos esforço manual? |
| 2. Barreira de qualidade | O pipeline impede (ou detecta) código quebrado antes de causar dano? |
| 3. Confiabilidade | A entrega é repetível e sem falsos positivos? |
| 4. Segurança e rastreabilidade | Os segredos ficam protegidos e dá para rastrear o que foi publicado? |

### 1.1 Decisões da orientação (08/10) e do ensaio (11/10)

| Data | Decisão |
|---|---|
| 08/10 | Escopo: só eficiência e qualidade (eixos 1 e 2). |
| 08/10 | Leitura B: cada amostra é um **incremento real de código**, e não uma mudança artificial. |
| 11/10 | Molde de "uma rota nova": model + controller + router, no mínimo 3 testes Jest, 1 passo novo no smoke e **sem migration**. |
| 11/10 | Opção 4 para as amostras manuais: o merge usa " skip ci" (entre colchetes) no título do commit de squash, digitado à mão, para o pipeline não rodar; o deploy manual parte da main, no commit do merge. |
| 11/10 | O smoke aceita **qualquer 2xx** (não só 200) e imprime `chamadas_2xx` e o horário de fim na última linha. |
| 11/10 | O congelamento vale para o **ambiente** (EC2, banco, `runs-on`, versões e front-end em branch), não para o código da API, que muda a cada amostra. |

**Smoke cumulativo (15/10).** O smoke é cumulativo: cada amostra acrescenta 1 passo, então `scripts/smoke.ps1` muda de propósito ao longo da coleta e o hash congelado antigo deixa de valer. A amostra 1 introduziu a primeira escrita real, um `POST /protocols/<id>/ips` num protocolo dedicado (`SMOKE-0001`, "SMOKE TESTE"). Isso muda dados de produção de forma controlada: o protocolo foi criado uma vez, via API, e as linhas gravadas em `ips` acumulam a cada execução e serão removidas por SQL ao fim da coleta.

## 2. Definições operacionais

- **Deploy bem-sucedido** (igual nas duas modalidades), verificado por um script de smoke:
  1. `GET /health` responde 2xx **consultando o banco** (M3b, concluído);
  2. `POST /auth/login` responde 2xx;
  3. `GET /protocols` com o token responde 2xx;
  4. a cada amostra, o passo da rota nova acrescentado ao smoke também responde 2xx.
- **Tempo total:** do início ao smoke OK, calculado por **timestamps registrados pelo sistema**, e não por cronômetro. Pipeline: horário de criação do run (`gh run view`, UTC) até o fim do smoke. Manual: horário do primeiro e do último comando no histórico com data e hora. Como o smoke é disparado por uma pessoa, registrar também a duração do run e a espera até o smoke.
- **Nº de comandos:** comandos digitados, contados no histórico (manual) ou no roteiro do pipeline (merge e smoke). Comandos de verificação (variáveis de ambiente, atualização do repositório e smoke) são registrados à parte dos de deploy.
- **Nº de intervenções manuais:** pontos em que uma pessoa precisa digitar, colar, clicar ou decidir, contados pelo roteiro e conferidos no histórico.
- **Dados sensíveis manipulados à mão:** valores (senhas, chaves) que a operadora digita ou cola.
- **Falha:** run vermelho, deploy que não passa no smoke, ou falso positivo (pipeline verde com aplicação não funcional). Cada falha é registrada com o tipo.
- **Tempo de recuperação:** do início do problema até o smoke OK, apenas nos testes de falha.

## 3. Métricas

| Métrica | Fonte | Risco de viés |
|---|---|---|
| Tempo total | Timestamps (GitHub e histórico de comandos) | Baixo |
| Nº de comandos | Histórico de comandos | Baixo |
| Nº de intervenções manuais | Roteiro fixo, conferido no histórico | Baixo |
| Dados sensíveis manipulados à mão | Roteiro | Baixo |
| Erros e falhas (com tipo) | Saída dos comandos e status dos runs | Baixo |
| Tempo de recuperação | Timestamps, testes de falha | Baixo |
| Checklist de segurança e rastreabilidade | Evidências com link | Médio (julgamento), mitigado pelo link |

Correspondência com o DORA: lead time for changes (trecho de deploy), change failure rate, time to restore service. Nº de comandos e de intervenções são métricas complementares propostas neste trabalho.

## 4. Coleta

### 4.1 Pré-requisitos (até 13/10)
- M3b: `/health` consultando o banco (503 se falhar). **Feito** (PR #11).
- `runs-on` fixo (a etiqueta `ubuntu-latest` migra para Ubuntu 26 em 19/10/2026). **Feito** (PR #12, `ubuntu-24.04`).
- Script de smoke (**feito**, PRs #9, #13 e #17) e roteiro manual escrito (**feito**, `docs/roteiro-manual.md`).
- Ficha de coleta em CSV (**feita**, `docs/ficha-coleta.csv`).
- Registro automático do manual: na EC2, histórico com data e hora (`HISTTIMEFORMAT="%F %T "`); no computador, histórico do PowerShell ou gravação do terminal. **O que captura melhor uma sessão SSH no Windows será testado no piloto.**
- O front-end fica em **branch**, fora da main, até o fim das coletas, para o build não mudar no meio. O que se congela é o ambiente; o código da API muda a cada amostra (seção 1.1).

### 4.2 Procedimento
1. **Piloto:** 1 deploy manual de treino, descartado e documentado (absorve o aprendizado e testa o registro automático).
2. **Amostra:** 5 pares (5 pipeline + 5 manual), **alternando** as modalidades.
3. **Mudança:** cada amostra é um incremento real de código (leitura B), seguindo o molde de "uma rota nova" da seção 1.1 (model, controller e router, no mínimo 3 testes Jest, 1 passo no smoke, sem migration), para que as amostras tenham tamanho equivalente. Os testes rodam nas duas modalidades.
4. **Ambiente:** o deploy manual sempre de casa ou do hotspot (a rede da instituição bloqueia as portas 22 e 3001); registrar o ambiente de cada coleta.
5. **Roteiro manual:** testes locais, build da imagem, login e push no ECR, SSH na EC2, pull, troca do container, smoke.
6. **Ficha por coleta:** nº, modalidade, data/hora de início (Brasília), commit, run id, ambiente, tempo total, nº de comandos, nº de intervenções, dados sensíveis manipulados, erros, observações.
7. **Evidência:** guardar o histórico de comandos e, opcionalmente, a gravação de tela das coletas manuais. **Mascarar senhas e chaves antes de anexar ou commitar qualquer histórico.**
8. **Regra de amostra:** amostra que falha **conta como dado**. Só é invalidada por causa externa (queda da AWS ou da rede), justificada por escrito.

### 4.3 Testes de falha (eixo 2 e recuperação)
- **(a) Teste quebrado** e **(b) build Docker quebrado:** em branch com PR, onde ECR e deploy não rodam. Esperado: job vermelho e nada publicado. Resultado: **bloqueio**.
- **(c) API sem banco:** parar o Postgres na EC2 e rodar o pipeline. Como o pipeline publica e só depois valida, o esperado é `/health` 503 e job vermelho **depois** do deploy. Resultado: **detecção**, e não bloqueio. A versão ruim já está na EC2 e não há rollback automático (limitação a registrar). Executar **uma vez**, em janela controlada, e restaurar em seguida.
- **Recuperação:** corrigir um deploy ruim pelo pipeline (revert + merge) e pelo processo manual; medir do início do problema até o smoke OK.

### 4.4 Checklist de segurança e rastreabilidade (eixo 4)
Para cada item, avaliar pipeline e manual: atende / atende parcialmente / não atende, com link de evidência.
- Segredos fora do código e dos logs.
- Rotação de segredo sem editar o `ci.yml`.
- Deploy só a partir da main.
- Ligação commit → run → imagem no ECR (verificar como a imagem é etiquetada).
- Limitações conhecidas (registrar com honestidade): SSH aberto ao mundo, sem rollback, banco fora do pipeline e sem backup, repositório público com valores antigos no histórico (rotacionados).

## 5. Critério de decisão (definido antes de coletar)

O pipeline é considerado **melhor** se, ao mesmo tempo:
1. tem **menos comandos e menos intervenções manuais** que o manual (mediana);
2. **bloqueou** as falhas (a) e (b) e **detectou** a falha (c);
3. a taxa de falha não é pior que a do manual;
4. o checklist atende mais itens que o processo manual.

O tempo total é descritivo: se empatar ou o pipeline for mais lento, isso é reportado. Limites numéricos a combinar com a orientadora.

## 6. Análise

- n=5 por modalidade: **sem teste estatístico**. Reportar mediana, mínimo e máximo por modalidade e a diferença de cada par.
- Redução percentual: `(manual − pipeline) / manual × 100`, para tempo, comandos e erros (como em Hyun et al., 2024).
- Reportar **todas** as amostras. Em caso de valor atípico, acrescentar amostras em vez de repetir seletivamente.

## 7. Replicação

- Tag `v1.0-tcc`, roteiro e script de smoke no repositório, fichas em CSV e runs públicos (o repositório é público).
- Outro avaliador (por exemplo, a orientadora) repete com o `docs/deploy.md` e a ficha.
- Versões fixadas: `runs-on`, versões das actions, imagem base.

## 8. Como mostrar no texto

1. **Metodologia:** pergunta, hipótese, métricas (termos DORA), procedimento, critério de decisão.
2. **Resultados:** Tabela 1 (as 10 coletas); Tabela 2 (testes de falha); Tabela 3 (recuperação); Tabela 4 (checklist); gráfico de pontos manual × pipeline (tempo total); gráfico de barras de comandos e intervenções; gráfico de barras dos jobs do pipeline; prints dos runs.
3. **Discussão:** mapeamento para DORA, comparação com Hyun et al. (2024), resposta à hipótese e ameaças à validade.
4. **Apêndices:** roteiro manual, fichas, históricos mascarados, links dos runs, `devops-log.md`.

## 9. Ameaças à validade

- **Operadora e avaliadora são a mesma pessoa.** Mitigação: métricas registradas pelo sistema, critério escrito antes, todas as amostras reportadas, gravação de tela opcional e replicação por outra pessoa.
- **Operadora experiente no manual** (favorece o manual).
- **Um sistema, uma conta AWS, um ISP** (validade externa limitada).
- **Amostra pequena** (n=5): evidência descritiva, não generalizável.
- **Rede diferente** entre o runner do GitHub e o hotspot; registrar o ambiente.
- **Cache de camadas do Docker** no build local.
- **Construto:** "melhor" foi traduzido em quatro eixos; custo e curva de aprendizado ficam de fora.
- **Testes:** o manual precisa rodar os testes para a comparação ser justa (ou reportar os dois cenários).
- **Incrementos de código diferentes entre amostras:** o molde fixo limita, mas não elimina, a variação de tamanho e de complexidade entre as rotas.
- **Pool de conexões sem `connectionTimeoutMillis`:** o `Pool` do `pg` (`backend/src/database/connection.js`) não limita o tempo de espera por conexão. Com o banco travado, uma requisição que usa o pool pode ficar pendurada, sem erro. O `/health` não sofre disso porque tem timeout próprio (2 s). Limitação registrada, não corrigida, para não alterar a API fora do escopo da PoC.
- **Efeito de prática:** ensaio de 11/10 = 709 s; piloto = 431 s; treino ~315 s (estimativa: 254 s + ~60 s do intervalo entre merge e A1). Favorece o manual.
- **Cache do Docker:** build de 0,7 s no treino; nas amostras só a camada `COPY . .` é refeita. Favorece o manual: o job build-docker do pipeline não usa cache de camadas (ci.yml), então o runner constrói do zero a cada execução.
- **Operadora única, autora do pipeline** (conflito de interesse declarado); n=5 por modalidade, sem inferência estatística; resultados reportados como valores individuais e medianas.
- **Enquadramento:** estudo de caso (Runeson & Höst, 2009), sem generalização estatística.
- **Dependências com vulnerabilidades conhecidas:** o `npm audit` aponta 28 vulnerabilidades (22 moderate, 5 high, 1 critical). Não foram corrigidas: atualizar dependências alteraria a camada npm install da imagem durante a coleta e fugiria do escopo da PoC.
- **Desvio entre o relógio do GitHub e o do PC:** o início da amostra vem do commit de merge (servidor do GitHub) e o fim, do smoke (PC). O desvio do relógio do PC em relação a uma referência de rede só afeta as amostras manuais, cujo fim vem do smoke rodando no PC; o relógio do site serve só de conferência. O desvio **varia de um dia para o outro**: +2,95 s em 13/10 (referência time.windows.com, nove medições entre +2,92 s e +2,96 s) e cerca de +1,06 s e depois +0,7 s em 16/10. Por isso ele é **medido antes e depois de cada amostra manual** com a.ntp.br e somado **individualmente, com sinal** (positivo = PC atrasado; negativo = PC adiantado) ao tempo bruto de cada amostra, e não mais declarado uma única vez. A sincronização pelas Configurações do Windows falhou, sem causa identificada. Em 16/10 o relógio do PC foi corrigido por `Set-Date`, pela mediana de 5 leituras, ficando um residual de cerca de ±0,05 s, com o w32time parado durante a amostra para o relógio não ser ajustado no meio da medição. Em 17/10 o desvio medido foi de -0,190 s, corrigido uma única vez por `Set-Date` com o w32time parado; as medições antes e depois da amostra 4 foram -0,0138 s e -0,0092 s.

## 10. Cronograma

| Quando | O quê |
|---|---|
| 08/10 | Orientação: pergunta aprovada; escopo e leitura B decididos |
| 09 a 11/10 | M3b, script de smoke, roteiro manual, ficha CSV |
| 13/10 | `runs-on` fixo, método fechado, piloto manual descartado |
| 14 a 20/10 | 10 coletas (5 + 5, alternando) e testes de falha (a) e (b) |
| 21/10 | Teste de falha (c) e recuperação |
| 23/10 | Análise: tabelas e gráficos |

## 11. Material já disponível

**Referências**
- DORA (definições): [GitLab](https://about.gitlab.com/topics/devops/dora-metrics/); [Apache DevLake — Lead Time for Changes](https://devlake.apache.org/docs/Metrics/LeadTimeForChanges).
- Hyun et al. (2024), *The Impact of an Automation System Built with Jenkins on the Efficiency of Container-Based System Deployment*, Sensors 24(18): [PMC11436161](https://pmc.ncbi.nlm.nih.gov/articles/PMC11436161).
- Pendente de verificação: Forsgren, Humble e Kim (2018), *Accelerate* (citação completa); relatório oficial *State of DevOps* (dora.dev).

**Amostras preliminares do pipeline na main** (sem smoke completo; apenas linha de base descritiva, fora das amostras oficiais)

| Data | Run (id) | Duração |
|---|---|---|
| 24/09 | 36039412142 | 1m49s |
| 04/10 | 37245387841 | 1m51s |
| 06/10 | 37546243209 | 1m53s (sem step de health) |
| 07/10 | 37705220239 | 1m49s (jobs: 37s / 15s / 22s / 26s; health sem consulta ao banco) |
| 07/10 | 37713239762 | 1m38s |
| 07/10 | 37714902588 | 1m41s (smoke ≈ 1m59s; ensaio) |

- Run 37550804020 (#18, 06/10): falso positivo (pipeline verde, senha do banco divergente); fora das amostras e usado como estudo de caso.
- Run 35444528525 (24/09): mistura jobs de datas diferentes por re-run parcial; não usar a duração total.
- Também disponíveis: `docs/devops-log.md`, `docs/deploy.md`, `ci.yml`, 181 testes, histórico de falhas e correções.
- **Não há** tempos de deploy manual registrados; a coleta manual começa do zero.
