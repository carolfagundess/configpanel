# Roteiro da série 2 (deploy do mesmo código, pipeline × manual)

Versão 1.0, 28/10/2026. Base: decisões da orientação de 27/10 e da Carol (28/10). A série 2 **não se mistura** com a série 1: ficha própria (`docs/ficha-coleta-serie2.csv`) e evidências em `docs/evidencias-serie2/`.

## O que é uma entrega

- Cada entrega é **só um deploy do mesmo código**. O gatilho é o merge (Squash and merge) de um PR preparado por `scripts/serie2-preparar.ps1`:
  - **vazio**: um `git commit --allow-empty` (0 arquivos);
  - **marcador**: troca de 1 linha em `backend/src/marcador-deploy.js` (`serie2-<Id>`, sempre 45 caracteres), arquivo que nenhum módulo importa. Fica dentro de `backend/`, então entra no `COPY . .` do Dockerfile.
- **Alternância estrita** pipeline/manual, entrega a entrega (o script confere pela última linha da ficha v2). O número de entregas fica em aberto.
- **Id**: 4 caracteres, sempre do mesmo tamanho (`C001` a `C004` na calibração; `0001` em diante nas amostras).
- **Início** = hora do commit de merge (servidor do GitHub, precisão de 1 s). **Fim** = primeira linha `[req]` 2xx, depois do `StartedAt` do container, de cada ponto de leitura, lida no log da EC2 nas duas fontes (horário do middleware e `docker logs --timestamps`):

| Ponto | Requisição | Passo do smoke |
|---|---|---|
| p08 | `POST /protocols/:id/comunicacoes` | 8 |
| p10 | `GET /protocols/:id/checklist` | 10 |
| p12 | `PATCH /protocols/:id/checklist/:itemId` | 12 |
| p13 | `GET /protocols/:id/history` | 13 (equivale ao `fim=` da série 1; **métrica principal**) |

- Sem ajuste nem medição do relógio do PC: início e fim vêm de relógios de servidor (GitHub e EC2).

## Regras novas

1. Rodar `scripts/serie2-coleta.ps1` **antes do próximo deploy**: o `docker rm` (pipeline e B8) apaga o log do container anterior. O script grava as linhas `[req]` em `docs/evidencias-serie2/<Id>-<sha7>-req.log`.
2. Entre o deploy e o fim do smoke, **ninguém chama a API à mão** (só o B12, que é `/health`, fora dos pontos de leitura).
3. Sem `docker image prune` durante as rodadas. Se faltar espaço, só `docker image prune` (sem `-a`), **entre** rodadas, registrado em observações. A coleta grava o uso do disco (`disco_ec2_uso`).
4. O smoke continua rodando de fora (runner do GitHub ou PC) e não muda; o `fim=` que ele imprime vira só conferência.

## Entrega pipeline

1. `.\scripts\serie2-preparar.ps1 -Id <Id> -Modalidade pipeline -Gatilho <vazio|marcador>` (espera os checks e o `CLEAN`; não faz merge).
2. No PR: **Squash and merge sem alterar o título**.
3. Esperar o run de push na main terminar.
4. `$env:EC2_IP = "<IP_DA_EC2>"` e `.\scripts\serie2-coleta.ps1 -Id <Id> -Modalidade pipeline -Sha <sha do merge>` → colar a linha CSV na ficha v2.

## Entrega manual (mudanças em relação ao `roteiro-manual.md` v1.4)

- **Antes de começar:** sai a conferência do relógio (w32tm, Set-Date, a.ntp.br). Sai "código do incremento pronto": em vez disso, `.\scripts\serie2-preparar.ps1 -Id <Id> -Modalidade manual -Gatilho <vazio|marcador>`. Na ficha, só o `id` é anotado antes; o resto vem da coleta.
- **Merge:** igual (Squash and merge com ` [skip ci]` digitado à mão no fim do título).
- **Partes A e B:** iguais (15 comandos D, testes locais no A8). O A10 continua com `$SHA = git rev-parse HEAD`: a tag `:$SHA` no ECR é como a coleta acha a imagem da entrega.
- **Parte C:** o C2 (smoke) continua; o C4 sai. Depois do smoke (fora do tempo e da contagem): `.\scripts\serie2-coleta.ps1 -Id <Id> -Modalidade manual -Sha $SHA -SmokeOk <sim|nao>`, e preencher à mão `comandos`, `intervencoes` e `dados_sensiveis_manuais`.

## Calibração (4 entregas, todas `nao_e_amostra=sim`)

Feita depois do merge e do deploy do PR do middleware, nesta ordem (alternância estrita):

| Id | Modalidade | Gatilho |
|---|---|---|
| C001 | pipeline | vazio |
| C002 | manual | vazio |
| C003 | pipeline | marcador |
| C004 | manual | marcador |

Na coleta, acrescentar `-NaoEhAmostra -Calibracao`. O relatório vai para `docs/evidencias-serie2/<Id>-<sha7>-calibracao.txt`.

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
8. o tempo total por ponto de leitura.

## Camadas do Dockerfile e o que o gatilho muda

Ordem em `backend/Dockerfile`: `FROM node:24-alpine` → `WORKDIR /app` → `COPY package*.json ./` → `RUN npm install --omit=dev` → `COPY . .` (o `.dockerignore` exclui `node_modules`, `tests`, `*.md`, `.env` e `.git`).

- **Manual (build local com cache):** com o **vazio**, nenhum arquivo muda; espera-se cache em todas as camadas e o mesmo conteúdo da imagem anterior. Com o **marcador**, só a camada do `COPY . .` (cerca de 66 KB comprimida) é refeita; as do `npm install` e da base vêm do cache.
- **Pipeline (runner sem cache):** com qualquer um dos dois gatilhos, o runner refaz `COPY package*.json`, `npm install` e `COPY . .`; só as camadas da base (`node:24-alpine`) se repetem.
