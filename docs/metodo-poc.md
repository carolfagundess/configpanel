# Método da PoC — Deploy manual vs. pipeline (ConfigPanel)

Versão 1.1 — 07/10/2026 (horários de Brasília, UTC-3; horários do GitHub/EC2 aparecem em UTC e são rotulados)
Status: **proposta**, a validar com a orientadora na orientação de 08/10/2026.

Mudança da v1.0 para a v1.1: o "tempo ativo do operador" foi retirado do critério (depende da anotação da própria operadora e é passível de erro ou manipulação). Entraram métricas registradas pelo sistema: tempo total por timestamps, nº de comandos, nº de intervenções manuais e nº de dados sensíveis manipulados à mão. O teste de falha (c) passou a ser tratado como **detecção**, e não como bloqueio (ver 4.3).

## 1. Pergunta e hipótese

**Pergunta norteadora (proposta; confirmar redação com o texto do TCC):**
Em que medida a adoção de práticas DevOps (Docker, GitHub Actions e AWS) melhora a entrega de software do ConfigPanel, em comparação com o processo manual, no contexto de um ISP?

**Hipótese:** o pipeline reduz o esforço manual (comandos e intervenções) e os erros, e barra código quebrado antes da produção. O tempo total pode ficar parecido.

"Melhor" é multicritério e é desdobrado em quatro eixos:

| Eixo | Sub-pergunta |
|---|---|
| 1. Eficiência | O pipeline entrega mais rápido e com menos esforço manual? |
| 2. Barreira de qualidade | O pipeline impede (ou detecta) código quebrado antes de causar dano? |
| 3. Confiabilidade | A entrega é repetível e sem falsos positivos? |
| 4. Segurança e rastreabilidade | Os segredos ficam protegidos e dá para rastrear o que foi publicado? |

## 2. Definições operacionais

- **Deploy bem-sucedido** (igual nas duas modalidades), verificado por um script de smoke:
  1. `GET /health` responde 200 **consultando o banco** (depende do M3b);
  2. `POST /auth/login` responde 200;
  3. `GET /protocols` com o token responde 200.
- **Tempo total:** do início ao smoke OK, calculado por **timestamps registrados pelo sistema**, e não por cronômetro. Pipeline: horário de criação do run (`gh run view`, UTC) até o fim do smoke. Manual: horário do primeiro e do último comando no histórico com data e hora.
- **Nº de comandos:** comandos digitados, contados no histórico (manual) ou no roteiro do pipeline (merge e smoke).
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
- M3b: `/health` consultando o banco (503 se falhar).
- `runs-on` fixo (a etiqueta `ubuntu-latest` migra para Ubuntu 26 em 19/10/2026).
- Script de smoke e roteiro manual escrito (passos vindos do `docs/deploy.md`).
- Ficha de coleta em CSV.
- Registro automático do manual: na EC2, histórico com data e hora (`HISTTIMEFORMAT="%F %T "`); no computador, histórico do PowerShell ou gravação do terminal. **O que captura melhor uma sessão SSH no Windows será testado no piloto.**
- O front-end fica em **branch**, fora da main, até o fim das coletas, para o build não mudar no meio.

### 4.2 Procedimento
1. **Piloto:** 1 deploy manual de treino, descartado e documentado (absorve o aprendizado e testa o registro automático).
2. **Amostra:** 5 pares (5 pipeline + 5 manual), **alternando** as modalidades.
3. **Mudança:** pequena e equivalente em todas as coletas; os testes rodam nas duas modalidades.
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

## 10. Cronograma

| Quando | O quê |
|---|---|
| 08/10 | Orientação: validar pergunta, eixos, critério e n |
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

- Run 37550804020 (#18, 06/10): falso positivo (pipeline verde, senha do banco divergente); fora das amostras e usado como estudo de caso.
- Run 35444528525 (24/09): mistura jobs de datas diferentes por re-run parcial; não usar a duração total.
- Também disponíveis: `docs/devops-log.md`, `docs/deploy.md`, `ci.yml`, 181 testes, histórico de falhas e correções.
- **Não há** tempos de deploy manual registrados; a coleta manual começa do zero.
