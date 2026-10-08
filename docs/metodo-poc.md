# Método da PoC — Deploy manual vs. pipeline (ConfigPanel)

Versão 1.0 — 07/10/2026 (horários de Brasília, UTC-3; horários do GitHub/EC2 aparecem em UTC e são rotulados)
Status: **proposta**, a validar com a orientadora na orientação de 08/10/2026.

## 1. Pergunta e hipótese

**Pergunta norteadora (proposta; confirmar redação com o texto do TCC):**
Em que medida a adoção de práticas DevOps (Docker, GitHub Actions e AWS) melhora a entrega de software do ConfigPanel, em comparação com o processo manual, no contexto de um ISP?

**Hipótese:** o pipeline reduz o tempo ativo do operador e os erros, e bloqueia código quebrado antes da produção. O tempo total pode ficar parecido.

"Melhor" é multicritério e é desdobrado em quatro eixos:

| Eixo | Sub-pergunta |
|---|---|
| 1. Eficiência | O pipeline entrega mais rápido e com menos esforço? |
| 2. Barreira de qualidade | O pipeline impede que código quebrado chegue à produção? |
| 3. Confiabilidade | A entrega é repetível e sem falsos positivos? |
| 4. Segurança e rastreabilidade | Os segredos ficam protegidos e dá para rastrear o que foi publicado? |

## 2. Definições operacionais

- **Deploy bem-sucedido** (igual nas duas modalidades), verificado por um script de smoke:
  1. `GET /health` responde 200 **consultando o banco** (depende do M3b);
  2. `POST /auth/login` responde 200;
  3. `GET /protocols` com o token responde 200.
- **Tempo total:** manual, do primeiro comando até o smoke OK; pipeline, do merge/push na main até o smoke OK (horário do run via `gh run view`, em UTC, convertido para Brasília).
- **Tempo ativo do operador:** soma dos intervalos em que a operadora age (digitar, colar, clicar, decidir). Espera de máquina não conta. Medido com hora de início e fim de cada passo na ficha. O smoke conta como tempo ativo nas duas modalidades.
- **Falha:** run vermelho, deploy que não passa no smoke, ou falso positivo (pipeline verde com aplicação não funcional). Cada falha é registrada com o tipo.
- **Tempo de recuperação:** do início do problema até o smoke OK, apenas nos testes de falha.

## 3. Métricas

| Métrica | Fonte |
|---|---|
| Tempo total | `gh run view` (pipeline); ficha (manual) |
| Tempo ativo | Ficha, por passo |
| Nº de passos manuais | Contagem do roteiro |
| Erros e falhas (com tipo) | Ficha e runs |
| Tempo de recuperação | Ficha, testes de falha |
| Checklist de segurança e rastreabilidade | Evidências com link |

Correspondência com o DORA: lead time for changes (trecho de deploy), change failure rate, time to restore service. O **tempo ativo** é uma métrica complementar proposta neste trabalho, não do DORA.

## 4. Coleta

### 4.1 Pré-requisitos (até 13/10)
- M3b: `/health` consultando o banco (503 se falhar).
- `runs-on` fixo (a etiqueta `ubuntu-latest` migra para Ubuntu 26 em 19/10/2026).
- Script de smoke e roteiro manual escrito (passos vindos do `docs/deploy.md`).
- Ficha de coleta em CSV.
- O front-end fica em **branch**, fora da main, até o fim das coletas, para o build não mudar no meio.

### 4.2 Procedimento
1. **Piloto:** 1 deploy manual de treino, descartado e documentado (absorve o aprendizado).
2. **Amostra:** 5 pares (5 pipeline + 5 manual), **alternando** as modalidades.
3. **Mudança:** pequena e equivalente em todas as coletas; os testes rodam nas duas modalidades.
4. **Ambiente:** o deploy manual sempre de casa ou do hotspot (a rede da instituição bloqueia a porta 22/3001); registrar o ambiente de cada coleta.
5. **Roteiro manual:** testes locais, build da imagem, login e push no ECR, SSH na EC2, pull, troca do container, smoke.
6. **Ficha por coleta:** nº, modalidade, data/hora (Brasília), commit, run id, ambiente, tempo total, tempo ativo, nº de passos, erros, observações.
7. **Regra de amostra:** amostra que falha **conta como dado**. Só é invalidada por causa externa (queda da AWS ou da rede), justificada por escrito.

### 4.3 Testes de falha (eixo 2 e recuperação)
- **(a) Teste quebrado** e **(b) build Docker quebrado:** em branch com PR, onde ECR e deploy não rodam. Esperado: job vermelho e nada publicado.
- **(c) API sem banco:** parar o Postgres na EC2 e rodar o pipeline. Esperado: `/health` 503 e job vermelho. Executar **uma vez**, em janela controlada, e restaurar em seguida.
- **Recuperação:** corrigir um deploy ruim pelo pipeline (revert + push) e pelo processo manual.

### 4.4 Checklist de segurança e rastreabilidade (eixo 4)
Para cada item: atende / atende parcialmente / não atende, com link de evidência.
- Segredos fora do código e dos logs (GitHub Secrets).
- Rotação de segredo sem editar o `ci.yml`.
- Deploy só a partir da main (`if` no `ci.yml`).
- Ligação commit → run → imagem no ECR.
- Limitações conhecidas (para registrar com honestidade): SSH aberto ao mundo, sem rollback, banco fora do pipeline e sem backup, repositório público com valores antigos no histórico (rotacionados).

## 5. Critério de decisão (definido antes de coletar)

O pipeline é considerado **melhor** se, ao mesmo tempo:
1. o tempo ativo mediano é menor que o do manual;
2. bloqueou todas as falhas injetadas (a, b, c);
3. a taxa de falha não é pior que a do manual;
4. o checklist atende mais itens que o processo manual.

O tempo total é descritivo: se empatar ou o pipeline for mais lento, isso é reportado. Limites numéricos a combinar com a orientadora.

## 6. Análise

- n=5 por modalidade: **sem teste estatístico**. Reportar mediana, mínimo e máximo por modalidade e a diferença de cada par.
- Redução percentual: `(manual − pipeline) / manual × 100`, para tempo e para erros (como em Hyun et al., 2024).
- Reportar **todas** as amostras. Em caso de valor atípico, acrescentar amostras em vez de repetir seletivamente.

## 7. Replicação

- Tag `v1.0-tcc`, roteiro e script de smoke no repositório, fichas em CSV e runs públicos (o repositório é público).
- Outro avaliador (por exemplo, a orientadora) repete com o `docs/deploy.md` e a ficha.
- Versões fixadas: `runs-on`, versões das actions, imagem base.

## 8. Como mostrar no texto

1. **Metodologia:** pergunta, hipótese, métricas (termos DORA), procedimento, critério de decisão.
2. **Resultados:** Tabela 1 (as 10 coletas); Tabela 2 (testes de falha); Tabela 3 (checklist); gráfico de pontos manual × pipeline (tempo total e ativo); gráfico de barras dos jobs do pipeline; prints dos runs.
3. **Discussão:** mapeamento para DORA, comparação com Hyun et al. (2024), resposta à hipótese, ameaças à validade.
4. **Apêndices:** roteiro manual, fichas, links dos runs, `devops-log.md`.

## 9. Ameaças à validade

- **Operadora única e experiente no manual** (favorece o manual).
- **Um sistema, uma conta AWS, um ISP** (validade externa limitada).
- **Amostra pequena** (n=5): evidência descritiva, não generalizável.
- **Rede diferente** entre o runner do GitHub e o hotspot; registrar o ambiente.
- **Cache de camadas do Docker** no build local.
- **Construto:** "melhor" foi traduzido em quatro eixos; custo e curva de aprendizado ficam de fora.
- **Testes:** o manual precisa rodar os testes para a comparação ser justa (ou reportar os dois cenários).

## 10. Cronograma

| Quando | O quê |
|---|---|
| 08/10 | Orientação: validar pergunta, eixos, critério e n |
| 09 a 11/10 | M3b, script de smoke, roteiro manual, ficha CSV |
| 13/10 | `runs-on` fixo, método fechado, piloto manual descartado |
| 14 a 20/10 | 10 coletas (5 + 5, alternando) e testes de falha (a) e (b) |
| 21/10 | Teste de falha (c) |
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

- Run 37550804020 (#18, 06/10): falso positivo (pipeline verde, senha do banco divergente); fora das amostras e usado como estudo de caso.
- Run 35444528525 (24/09): mistura jobs de datas diferentes por re-run parcial; não usar a duração total.
- Também disponíveis: `docs/devops-log.md`, `docs/deploy.md`, `ci.yml`, 181 testes, histórico de falhas e correções.
- **Não há** tempos de deploy manual registrados; a coleta manual começa do zero.
