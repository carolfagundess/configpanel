# Roteiro da série 2 (deploy do mesmo código, pipeline × manual)

Versão 1.1, 28/10/2026. Base: decisões da orientação de 27/10 e da Carol (28/10). A série 2 **não se mistura** com a série 1: ficha própria (`docs/ficha-coleta-serie2.csv`) e evidências em `docs/evidencias-serie2/`.
Changelog v1.1: fim só no p13 (p08, p10 e p12 saíram: com o mesmo código em todas as entregas, não acrescentam informação); colunas `rodada` e `tempo_ate_container_s`; `git pull --ff-only` antes de cada preparação; PR de docs no fim da rodada; limpeza das branches `serie2/*`.

## O que é uma entrega

- Cada entrega é **só um deploy do mesmo código**. O gatilho é o merge (Squash and merge) de um PR preparado por `scripts/serie2-preparar.ps1`:
  - **vazio**: um `git commit --allow-empty` (0 arquivos);
  - **marcador**: troca de 1 linha em `backend/src/marcador-deploy.js` (`serie2-<Id>`, sempre 45 caracteres), arquivo que nenhum módulo importa. Fica dentro de `backend/`, então entra no `COPY . .` do Dockerfile.
- **Alternância estrita** pipeline/manual, entrega a entrega (o script confere pela última linha da ficha v2). O número de entregas fica em aberto.
- **Id**: 4 caracteres, sempre do mesmo tamanho (`C001` a `C004` na calibração; `0001` em diante nas amostras).
- **Rodada**: número informado na coleta (`-Rodada`; 0 = calibração). Uma rodada é uma sessão de entregas seguidas, fechada pelo PR de docs (abaixo).
- **Início** = hora do commit de merge (servidor do GitHub, precisão de 1 s).
- **Fim (p13)** = primeira linha `[req]` 2xx de `GET /protocols/:id/history` (passo 13 do smoke, equivalente ao `fim=` da série 1) depois do `StartedAt` do container, lida no log da EC2 nas duas fontes: horário do middleware (`tempo_p13_mw_s`) e do `docker logs --timestamps` (`tempo_p13_docker_s`).
- **Até o container** (`tempo_ate_container_s`) = `StartedAt` do container menos o início.
- **Conferência:** `passos_2xx_log` conta quantos dos 13 passos do smoke têm linha 2xx no log (esperado 13/13). Todas as linhas `[req]` vão para a evidência.
- Sem ajuste nem medição do relógio do PC: início e fim vêm de relógios de servidor (GitHub e EC2).

## Regras novas

1. Rodar `scripts/serie2-coleta.ps1` **antes do próximo deploy**: o `docker rm` (pipeline e B8) apaga o log do container anterior. O script grava as linhas `[req]` em `docs/evidencias-serie2/<Id>-<sha7>-req.log`.
2. Entre o deploy e o fim do smoke, **ninguém chama a API à mão** (só o B12, que é `/health`, diferente do p13).
3. Sem `docker image prune` durante as rodadas. Se faltar espaço, só `docker image prune` (sem `-a`), **entre** rodadas, registrado em observações. A coleta grava o uso do disco (`disco_ec2_uso`).
4. O smoke continua rodando de fora (runner do GitHub ou PC) e não muda; o `fim=` que ele imprime vira só conferência.
5. **Antes de cada preparação:** `git switch main` e `git pull --ff-only`. O preparar exige a main igual a `origin/main`.
6. **Durante a rodada**, a ficha (`docs/ficha-coleta-serie2.csv`, com as linhas coladas) e as evidências (`docs/evidencias-serie2/`) ficam só alteradas no PC, sem commit. O preparar ignora esses dois caminhos na conferência de árvore limpa, mas recusa qualquer outro arquivo alterado e qualquer coisa no index (`git add`). Assim o commit do gatilho leva só o marcador, ou nada no vazio. O `git switch` leva e traz essas alterações sem mexer nelas.

## Fim de cada rodada: PR de docs e limpeza

1. Na main, com a ficha e as evidências da rodada alteradas:
   `git switch -c docs/serie2-rodada-<n>`, `git add docs/ficha-coleta-serie2.csv docs/evidencias-serie2`, `git commit -m "docs: serie 2, rodada <n> (ficha e evidencias)"` e `git push -u origin docs/serie2-rodada-<n>`.
   Depois, `gh pr create --base main --title "docs: serie 2, rodada <n> (ficha e evidencias)" --body "Ficha e evidencias da rodada <n>."`. O título do commit da branch fica **sem** a flag de pular CI, para os checks obrigatórios rodarem.
2. Merge: **Squash and merge com ` [skip ci]` digitado à mão no fim do título**. O PR de docs não é entrega. Se o pipeline rodar por engano, registrar nas observações: é um deploy fora da alternância.
3. `git switch main` e `git pull --ff-only`. A árvore volta limpa: a ficha e as evidências agora estão na main.
4. Apagar as branches da rodada, se o repositório não as apaga sozinho. Recomendado: ativar **Settings → General → Pull Requests → "Automatically delete head branches"**, ou `gh repo edit --delete-branch-on-merge`. Hoje está desligado (`deleteBranchOnMerge: false`). Sem isso: `git push origin --delete <branch>` para cada `serie2/e*` e `docs/serie2-rodada-*` mergeada, e `git branch -D <branch>` para as locais (`git branch --list 'serie2/*'`).

## Entrega pipeline

1. `git switch main; git pull --ff-only` e `.\scripts\serie2-preparar.ps1 -Id <Id> -Modalidade pipeline -Gatilho <vazio|marcador>` (espera os checks e o `CLEAN`; não faz merge).
2. No PR: **Squash and merge sem alterar o título**.
3. Esperar o run de push na main terminar.
4. `$env:EC2_IP = "<IP_DA_EC2>"` e `.\scripts\serie2-coleta.ps1 -Id <Id> -Rodada <n> -Modalidade pipeline -Sha <sha do merge>` → colar a linha CSV na ficha v2.

## Entrega manual (mudanças em relação ao `roteiro-manual.md` v1.4)

- **Antes de começar:** sai a conferência do relógio (w32tm, Set-Date, a.ntp.br). Sai "código do incremento pronto": em vez disso, `git switch main; git pull --ff-only` e `.\scripts\serie2-preparar.ps1 -Id <Id> -Modalidade manual -Gatilho <vazio|marcador>`. Na ficha, só o `id` é anotado antes; o resto vem da coleta.
- **Merge:** igual (Squash and merge com ` [skip ci]` digitado à mão no fim do título).
- **Partes A e B:** iguais (15 comandos D, testes locais no A8). O A10 continua com `$SHA = git rev-parse HEAD`: a tag `:$SHA` no ECR é como a coleta acha a imagem da entrega.
- **Parte C:** o C2 (smoke) continua; o C4 sai. Depois do smoke (fora do tempo e da contagem): `.\scripts\serie2-coleta.ps1 -Id <Id> -Rodada <n> -Modalidade manual -Sha $SHA -SmokeOk <sim|nao>`, e preencher à mão `comandos`, `intervencoes` e `dados_sensiveis_manuais`.

## Calibração (4 entregas, todas `nao_e_amostra=sim`)

Feita depois do merge e do deploy do PR do middleware, nesta ordem (alternância estrita):

| Id | Modalidade | Gatilho |
|---|---|---|
| C001 | pipeline | vazio |
| C002 | manual | vazio |
| C003 | pipeline | marcador |
| C004 | manual | marcador |

Na coleta, usar `-Rodada 0 -NaoEhAmostra -Calibracao`. O relatório vai para `docs/evidencias-serie2/<Id>-<sha7>-calibracao.txt`.

**Só nas entregas manuais de calibração (C002 e C004):**
- **B6 instrumentado** (o pull com `time` e `tee`, para medir a duração e as camadas baixadas):
  `time docker pull $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/configpanel-backend:latest 2>&1 | tee ~/serie2-pull.txt`
  Anotar o `real` impresso pelo `time`.
- **Depois do C2:** `Get-History | Export-Clixml "$env:TEMP\serie2-hist-<Id>.xml"` (fora do tempo; o arquivo contém a linha do `$EC2_IP`: não commitar e apagar depois da coleta).
- **Coleta:** `-HistoricoXml "$env:TEMP\serie2-hist-<Id>.xml" -DuracaoPullS <real do time, em s>`.

**O que a calibração confirma:**
1. o squash de um PR vazio gera commit na main;
2. o committer é `web-flow`;
3. o push dispara o pipeline (C001 e C003);
4. o ` [skip ci]` impede o run (C002 e C004);
5. o digest da imagem em cada entrega;
6. as camadas enviadas ao ECR e baixadas na EC2;
7. a duração dos steps (pipeline) e dos comandos de build, login, push e pull (manual);
8. o tempo até o container e até o p13, nas duas fontes.

## Camadas do Dockerfile e o que o gatilho muda

Ordem em `backend/Dockerfile`: `FROM node:24-alpine` → `WORKDIR /app` → `COPY package*.json ./` → `RUN npm install --omit=dev` → `COPY . .` (o `.dockerignore` exclui `node_modules`, `tests`, `*.md`, `.env` e `.git`).

- **Manual (build local com cache):** com o **vazio**, nenhum arquivo muda; espera-se cache em todas as camadas e o mesmo conteúdo da imagem anterior. Com o **marcador**, só a camada do `COPY . .` (cerca de 66 KB comprimida) é refeita; as do `npm install` e da base vêm do cache.
- **Pipeline (runner sem cache):** com qualquer um dos dois gatilhos, o runner refaz `COPY package*.json`, `npm install` e `COPY . .`; só as camadas da base (`node:24-alpine`) se repetem.
