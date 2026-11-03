# Roteiro manual da série 2 (entrega manual, deploy do mesmo código)

Versão 2.2, 02/11/2026. Substitui o `roteiro-manual.md` v1.4 **apenas para a série 2**; o v1.4 continua valendo como histórico da série 1. Contexto, métricas e calibração da série 2: `docs/roteiro-serie2.md`.
Princípio: a série 2 mede a entrega, não o produto.
Changelog v2.2 (lições das entregas 0008 e 0010): seção "Início de sessão"; sequência login → push `latest` → push `$SHA` explícita, com conferência P dos digests (A14b) antes do ssh; aviso de que os comandos da parte B não usam `$REG`/`$SHA` do PC; regra da senha do smoke digitada duas vezes na contagem. Os D continuam 15.
Changelog v2.1 (correções da calibração C001-C004): `Test-NetConnection` e `docker-compose up -d postgres` passam para antes do merge (o A4 só confere); o B6 vira duas linhas (B6-cal e B6-serie); regra de contagem de incidentes explícita; alternância estrita só dentro da rodada.
Regra: um comando por vez, mesma janela do PowerShell do início ao fim, de casa ou do hotspot (o firewall do IFSul bloqueia 22 e 3001). Não reiniciar a EC2. Nunca `docker stop`/`docker rm` no `configpanel-postgres`. Nenhum segredo digitado ou colado em chat.

Tipos: **D** = comando de deploy, **P** = preparação/verificação (contados separados). Intervenção = qualquer coisa fora deste roteiro (erro, retentativa, improviso).

## Início de sessão (uma vez por sessão, fora do tempo)
1. Abrir uma janela nova do PowerShell na pasta do projeto (`configpanel`); é a janela que será usada até o fim.
2. `$EC2_IP = "<IP_DA_EC2>"` e `$env:EC2_IP = $EC2_IP` (com aspas; o IP real só no terminal, nunca em arquivo).
3. Conferir imprimindo `$EC2_IP` (tem que aparecer o IP; vazio ou errado = PARE).
4. `ssh -i "$HOME\.ssh\configpanel-key.pem" ubuntu@$EC2_IP "df -h /"` (esperado `Use%` em torno de 70%; bem acima disso, ver a regra 3 do `roteiro-serie2.md` antes de seguir).
5. `git switch main; git pull --ff-only`.
6. `Import-Csv docs\ficha-coleta-serie2.csv | Select-Object -Last 1 | Format-List id,modalidade` (a última linha tem que ser a entrega anterior; senão PARE: falta colar uma coleta).

## Antes do merge (fora do tempo)
- Docker Desktop ligado; `docker version --format '{{.Server.Version}}'` e `aws sts get-caller-identity --query Account --output text` funcionando.
- `$EC2_IP` e `$env:EC2_IP` já definidos no início de sessão, na mesma janela.
- P: `Test-NetConnection $EC2_IP -Port 22` (esperado `TcpTestSucceeded : True`; senão PARE: IP errado).
- P: `docker-compose up -d postgres` (o A4 só confere que ele está rodando).
- O PR da entrega vem de `git switch main; git pull --ff-only` e `.\scripts\serie2-preparar.ps1 -Id <Id> -Modalidade manual -Gatilho <vazio|marcador>` (substitui "código do incremento pronto"; o script espera os checks e o `CLEAN` e não faz merge).
  - Alternância estrita só **dentro da mesma rodada**. A rodada sai do Id: `C...` = 0 (calibração); `0001`-`0010` = 1; `0011`-`0020` = 2; e assim por diante. A primeira entrega de uma rodada nova aceita qualquer modalidade (ex.: `0010` manual na rodada 1 e `0011` manual na rodada 2). Rodada menor que a da última linha da ficha é recusada. `-Rodada <n>` só para um Id fora desse padrão.
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
| A4 | P | `docker inspect -f '{{.State.Status}}' configpanel-postgres` (esperado `running`; senão PARE: o `up -d` é antes do merge) |
| A5 | P | `npm --prefix backend install` |
| A6 | P | `$env:DB_HOST = "localhost"` |
| A7 | P | `npm --prefix backend run migrate` |
| A8 | P | `npm --prefix backend test` (precisa passar; falha = registrar) |
| A9 | D | `$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text` (não imprime nada; isso é esperado) |
| A10 | D | `$REG = "$ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com"; $SHA = git rev-parse HEAD` |
| A11 | D | `docker build -t "$REG/configpanel-backend:latest" -t "$REG/configpanel-backend:$SHA" backend` |
| A12 | D | `aws ecr get-login-password --region us-east-2 \| docker login --username AWS --password-stdin $REG` (uma vez só, logo depois do build) |
| A13 | D | `docker push "$REG/configpanel-backend:latest"` (primeiro o `latest`: é a tag que a EC2 baixa no B6) |
| A14 | D | `docker push "$REG/configpanel-backend:$SHA"` |
| A14b | P | Conferir na tela: as linhas `digest: sha256:...` do A13 e do A14 têm que ser iguais. Se o push do `latest` não aparecer ou os digests divergirem, PARE e não siga para a parte B. |
| A15 | D | `ssh -i "$HOME\.ssh\configpanel-key.pem" ubuntu@$EC2_IP` |

Sequência fixa depois do build: login no ECR uma vez só (A12) → push do `latest` (A13) → push do `$SHA` (A14) → conferência dos digests (A14b) → ssh (A15). Motivo do A14b: na entrega 0008 o push do `latest` foi omitido, a EC2 baixou o `latest` antigo e subiu a imagem da entrega anterior, e o smoke passou, porque só testa se a API responde.

## Parte B: EC2 (um comando por vez)
**Aviso:** dentro do ssh valem só os comandos desta tabela. Eles não usam as variáveis `$REG` e `$SHA` do PC (na EC2 elas não existem; a conta vem do B2). Não digitar comandos da parte A dentro do ssh: foi o incidente da 0010.

| # | Tipo | Comando |
|---|---|---|
| B1 | P | `export HISTCONTROL=; export HISTTIMEFORMAT="%F %T "` |
| B2 | D | `ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)` |
| B3 | D | `umask 077; docker inspect configpanel-backend --format '{{range .Config.Env}}{{println .}}{{end}}' \| grep -E '^(DB_USER\|DB_PASSWORD\|JWT_SECRET)=' > ~/backend.env` |
| B4 | P | `wc -l ~/backend.env` (deve mostrar 3; senão PARE) |
| B5 | D | `aws ecr get-login-password --region us-east-2 \| docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com` |
| B6-cal | D | **Só na calibração. Execute APENAS UMA das duas linhas B6.** `time docker pull $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/configpanel-backend:latest 2>&1 \| tee ~/serie2-pull.txt` (anotar o `real` do `time`, em segundos) |
| B6-serie | D | **Só nas amostras da série. Execute APENAS UMA das duas linhas B6.** `docker pull $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/configpanel-backend:latest` |
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
2. Coleta (o IP vem do `$env:EC2_IP` definido no início de sessão):
   `.\scripts\serie2-coleta.ps1 -Id <Id> -Rodada <n> -Modalidade manual -Sha $SHA -SmokeOk <sim|nao>`
   - Na calibração, acrescentar: `-NaoEhAmostra -Calibracao -HistoricoXml "$env:TEMP\serie2-hist-<Id>.xml" -DuracaoPullS <real do time, em s>`.
   - `-Rodada 0` = calibração. Obrigatórios: `-Id`, `-Rodada`, `-Modalidade` e `-Sha`. O `-SmokeOk` é opcional no script, mas sem ele, no manual, a coluna `smoke_ok` fica vazia (a coleta avisa): informe sempre.
3. Colar a linha CSV no fim de `docs/ficha-coleta-serie2.csv` (sem linha em branco sobrando) e preencher à mão `comandos`, `intervencoes` e `dados_sensiveis_manuais`.
4. Apagar o XML do histórico.

## Contagem
- Os D são **15**: A9 a A15 (7) e B2, B3, B5, B6 (B6-cal ou B6-serie, nunca as duas), B7, B8, B9 e B13 (8). O A14b é P e não conta.
- 1 incidente fora do roteiro (erro digitado, retentativa, improviso; ex.: comando do PC digitado dentro do ssh) = **1 intervenção + 1 comando extra**, independentemente de quantos comandos a recuperação exigir. Descrever o incidente em `observacoes` (o IP real nunca vai para arquivo, nem nas observações).
- Dados sensíveis manuais: 1 (a senha do smoke). Se a senha do smoke for digitada duas vezes = **2 dados sensíveis**.

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
