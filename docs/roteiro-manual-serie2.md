# Roteiro manual da série 2 (entrega manual, deploy do mesmo código)

Versão 2.0, 28/10/2026. Substitui o `roteiro-manual.md` v1.4 **apenas para a série 2**; o v1.4 continua valendo como histórico da série 1. Contexto, métricas e calibração da série 2: `docs/roteiro-serie2.md`.
Princípio: a série 2 mede a entrega, não o produto.
Regra: um comando por vez, mesma janela do PowerShell do início ao fim, de casa ou do hotspot (o firewall do IFSul bloqueia 22 e 3001). Não reiniciar a EC2. Nunca `docker stop`/`docker rm` no `configpanel-postgres`. Nenhum segredo digitado ou colado em chat.

Tipos: **D** = comando de deploy, **P** = preparação/verificação (contados separados). Intervenção = qualquer coisa fora deste roteiro (erro, retentativa, improviso).

## Antes do merge (fora do tempo)
- Docker Desktop ligado; `docker version --format '{{.Server.Version}}'` e `aws sts get-caller-identity --query Account --output text` funcionando.
- Na janela que será usada até o fim: `$EC2_IP = "<IP_DA_EC2>"` e `$env:EC2_IP = $EC2_IP` (o IP real só no terminal, nunca em arquivo).
- O PR da entrega vem de `git switch main; git pull --ff-only` e `.\scripts\serie2-preparar.ps1 -Id <Id> -Modalidade manual -Gatilho <vazio|marcador>` (substitui "código do incremento pronto"; o script espera os checks e o `CLEAN` e não faz merge).
- Sem conferência de relógio (o w32tm sai) e sem preencher a ficha à mão antes: a linha vem da coleta.

## Merge (marca o início do relógio)
1. No PR: Squash and merge.
2. Digitar à mão ` [skip ci]` no fim do TÍTULO do commit de merge.
3. Conferir o texto (colchetes, minúsculas) e tirar um print da caixa antes de confirmar. Confirmar.
4. Anotar o SHA do commit de merge (7 caracteres bastam). O relógio começa no commit de merge; a hora é lida pela coleta.
5. A conferência de que nenhum run novo apareceu na aba Actions pode ser feita no fim; a coleta também a verifica.

## Parte A: PC (PowerShell, na raiz do repo, mesma janela, sem pausas)  [relógio começou no merge]
| # | Tipo | Comando |
|---|---|---|
| A1 | P | `git switch main; git pull --ff-only` |
| A2 | P | `git status` (podem aparecer SOMENTE `docs/ficha-coleta-serie2.csv` modificada e `docs/evidencias-serie2/` não rastreada; qualquer outro arquivo = PARE). Mudança em relação ao v1.4, que exigia árvore limpa. |
| A3 | P | `git rev-parse HEAD` (deve ser igual ao SHA do merge; senão PARE) |
| A4 | P | `docker-compose up -d postgres` |
| A5 | P | `npm --prefix backend install` |
| A6 | P | `$env:DB_HOST = "localhost"` |
| A7 | P | `npm --prefix backend run migrate` |
| A8 | P | `npm --prefix backend test` (precisa passar; falha = registrar) |
| A9 | D | `$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text` (não imprime nada; isso é esperado) |
| A10 | D | `$REG = "$ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com"; $SHA = git rev-parse HEAD` |
| A11 | D | `docker build -t "$REG/configpanel-backend:latest" -t "$REG/configpanel-backend:$SHA" backend` |
| A12 | D | `aws ecr get-login-password --region us-east-2 \| docker login --username AWS --password-stdin $REG` |
| A13 | D | `docker push "$REG/configpanel-backend:latest"` |
| A14 | D | `docker push "$REG/configpanel-backend:$SHA"` |
| A15 | D | `ssh -i "$HOME\.ssh\configpanel-key.pem" ubuntu@$EC2_IP` |

## Parte B: EC2 (um comando por vez)
| # | Tipo | Comando |
|---|---|---|
| B1 | P | `export HISTCONTROL=; export HISTTIMEFORMAT="%F %T "` |
| B2 | D | `ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)` |
| B3 | D | `umask 077; docker inspect configpanel-backend --format '{{range .Config.Env}}{{println .}}{{end}}' \| grep -E '^(DB_USER\|DB_PASSWORD\|JWT_SECRET)=' > ~/backend.env` |
| B4 | P | `wc -l ~/backend.env` (deve mostrar 3; senão PARE) |
| B5 | D | `aws ecr get-login-password --region us-east-2 \| docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com` |
| B6 | D | **Série:** `docker pull $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/configpanel-backend:latest`<br>**Só na calibração:** `time docker pull $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/configpanel-backend:latest 2>&1 \| tee ~/serie2-pull.txt` (anotar o `real` do `time`, em segundos) |
| B7 | D | `docker stop configpanel-backend` (espere o nome do contêiner voltar na tela, pode levar ~10 s, antes de digitar o B8) |
| B8 | D | `docker rm configpanel-backend` |
| B9 | D | `docker run -d --name configpanel-backend --network configpanel-net --env-file ~/backend.env -e DB_HOST=configpanel-postgres -e DB_PORT=5432 -e DB_NAME=configpanel -e JWT_EXPIRES_IN=8h -e PORT=3001 -p 3001:3001 $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/configpanel-backend:latest` |
| B10 | P | `docker ps` |
| B11 | P | `docker logs --tail 20 configpanel-backend` |
| B12 | P | `curl http://localhost:3001/health` (esperado: status ok, db up) |
| B13 | D | `rm ~/backend.env` |
| B14 | P | `exit` (o history da EC2 deixa de ser copiado) |

## Parte C: aceite (PowerShell no PC, mesma janela)
| # | Tipo | Comando |
|---|---|---|
| C1 | P | `$env:CONFIGPANEL_URL = "http://${EC2_IP}:3001"; $env:SMOKE_USER = "smoke.teste"` |
| C2 | P | `.\scripts\smoke.ps1` (senha no prompt = 1 dado sensível manual) |

O C3 (Get-History em tabela) e o C4 (`git log %cI`) do v1.4 saem: a coleta lê o início e o fim.

## Depois do smoke (fora do tempo e da contagem)
1. Só na calibração: `Get-History | Export-Clixml "$env:TEMP\serie2-hist-<Id>.xml"` (contém a linha do `$EC2_IP`: não commitar e apagar depois da coleta).
2. Coleta (o IP vem do `$env:EC2_IP` definido antes do merge):
   `.\scripts\serie2-coleta.ps1 -Id <Id> -Rodada <n> -Modalidade manual -Sha $SHA -SmokeOk <sim|nao>`
   - Na calibração, acrescentar: `-NaoEhAmostra -Calibracao -HistoricoXml "$env:TEMP\serie2-hist-<Id>.xml" -DuracaoPullS <real do time, em s>`.
   - `-Rodada 0` = calibração. Obrigatórios: `-Id`, `-Rodada`, `-Modalidade` e `-Sha`. O `-SmokeOk` é opcional no script, mas sem ele, no manual, a coluna `smoke_ok` fica vazia (a coleta avisa): informe sempre.
3. Colar a linha CSV no fim de `docs/ficha-coleta-serie2.csv` (sem linha em branco sobrando) e preencher à mão `comandos`, `intervencoes` e `dados_sensiveis_manuais`.
4. Apagar o XML do histórico.

## Contagem
- Os D são **15**: A9 a A15 (7) e B2, B3, B5, B6, B7, B8, B9 e B13 (8).
- Erro digitado ou retentativa = 1 intervenção + 1 comando extra.
- Dados sensíveis manuais: 1 (a senha do smoke).

## O que a coleta mede
- Início: commit de merge (hora do servidor do GitHub).
- Métrica principal: `tempo_ate_container_s`, do merge até o `StartedAt` do contêiner novo.
- Métrica secundária: tempo até o p13 (primeira linha 2xx de `GET /protocols/:id/history` no log da EC2).
- Smoke: registrado em `smoke_ok` e `passos_2xx_log`, fora do cronômetro principal.

## Expectativas e cuidados
- A primeira entrega manual depois de uma mudança de código reconstrói a camada do `COPY . .` (o cache local está desatualizado); por isso a C002 não é representativa. A partir daí, o gatilho vazio fica 100% em cache e o gatilho marcador refaz só a camada do `COPY . .`.
- Não chamar a API à mão entre o deploy e o fim do smoke (só o B12, que é `/health`).
- Rodar a coleta antes do próximo deploy: o log do contêiner some no `docker rm`.
- Apagar o XML do histórico depois da coleta.
