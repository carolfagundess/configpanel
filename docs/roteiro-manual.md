Para a série 2, use docs/roteiro-manual-serie2.md.

# Roteiro manual final (modalidade manual da PoC)

Versão 1.4, 12/10/2026. Changelog v1.4: variável `$EC2_IP` (A15, C1); A9, B7 e B14 esclarecidos; C3 com `EndExecutionTime`; regras de contagem e de início da amostra. Baseado no ensaio manual de 11/10 e na decisão de 11/10 (opção 4: merge com [skip ci] e deploy manual a partir da main).
Regra: um comando por vez, mesma janela do PowerShell do início ao fim, de casa ou do hotspot (o firewall do IFSul bloqueia 22 e 3001). Não reiniciar a EC2. Nunca `docker stop`/`docker rm` no `configpanel-postgres`. Nenhum segredo digitado ou colado em chat.

Tipos: **D** = comando de deploy, **P** = preparação/verificação (contados separados). Intervenção = qualquer coisa fora deste roteiro (erro, retentativa, improviso).

## Antes de começar (não conta no tempo)
- `docker version --format '{{.Server.Version}}'` e `aws sts get-caller-identity --query Account --output text` funcionando.
- Código do incremento pronto, com teste Jest passando, em PR aberto e verde. O desenvolvimento não é medido.
- Conferir que o commit da ramificação do PR NÃO contém [skip ci] (senão os checks do PR ficam "Pending").
- Definir `$EC2_IP = "<IP_DA_EC2>"` (troque pelo IP real no terminal, nunca no arquivo). Fazer isto antes de iniciar o relógio.
- Só nas amostras manuais: conferir o relógio do PC com `w32tm /stripchart /computer:time.windows.com /samples:1 /dataonly` (anote o desvio medido, em segundos, nas observações da ficha; a coluna tempo_total_s guarda o valor bruto e o desvio é somado só na análise). Isto fica fora do relógio e não conta como comando.
- Preencher na ficha: id, cenario, modalidade, image_version (a do último run do pipeline), arquivos_alterados, linhas_alteradas, testes_novos (do git diff --stat do PR).

## Merge (marca o início do relógio)
1. No PR: Squash and merge.
2. Digitar à mão ` [skip ci]` no fim do TÍTULO do commit de merge.
3. Conferir o texto (colchetes, minúsculas) antes de confirmar. Confirmar.
4. Anotar o SHA do commit de merge (será usado no C4). A hora de início oficial é a do commit, lida no C4; o horário da página do PR é só conferência.
5. Conferir na aba Actions, depois de ~2 minutos, que NÃO apareceu execução nova na main. Se aparecer, registrar como intervenção e a amostra deixa de ser válida.

## Parte A: PC (PowerShell, na raiz do repo)  [relógio começou no merge]
| # | Tipo | Comando |
|---|---|---|
| A1 | P | `git switch main; git pull --ff-only` |
| A2 | P | `git status` (deve estar limpo; senão PARE) |
| A3 | P | `git rev-parse HEAD` (deve ser igual ao SHA do merge; senão PARE; anotar na ficha) |
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
| B6 | D | `docker pull $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/configpanel-backend:latest` |
| B7 | D | `docker stop configpanel-backend` (espere o nome do contêiner voltar na tela, pode levar ~10 s, antes de digitar o B8) |
| B8 | D | `docker rm configpanel-backend` |
| B9 | D | `docker run -d --name configpanel-backend --network configpanel-net --env-file ~/backend.env -e DB_HOST=configpanel-postgres -e DB_PORT=5432 -e DB_NAME=configpanel -e JWT_EXPIRES_IN=8h -e PORT=3001 -p 3001:3001 $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/configpanel-backend:latest` |
| B10 | P | `docker ps` |
| B11 | P | `docker logs --tail 20 configpanel-backend` |
| B12 | P | `curl http://localhost:3001/health` (esperado: status ok, db up) |
| B13 | D | `rm ~/backend.env` |
| B14 | P | `history \| tail -n 40` (copie só a partir do B1 e troque o IP e o ID da conta por `<IP_DA_EC2>` e `<ID_DA_CONTA>`; depois `exit`) |

## Parte C: aceite (PowerShell no PC)  [relógio termina no SMOKE OK]
| # | Tipo | Comando |
|---|---|---|
| C1 | P | `$env:CONFIGPANEL_URL = "http://${EC2_IP}:3001"; $env:SMOKE_USER = "smoke.teste"` |
| C2 | P | `.\scripts\smoke.ps1` (senha no prompt = 1 dado sensível manual) |
| C3 | P | `Get-History \| Select-Object Id,StartExecutionTime,EndExecutionTime,CommandLine \| Format-Table -AutoSize -Wrap` (anote o Id do A1 e copie só dali em diante; descarte a linha do $EC2_IP) |
| C4 | P | `git log -1 --format=%cI <sha_do_merge>` (hora de início da amostra; se vier em UTC, subtrair 3 h; na modalidade pipeline, use o sha_merge da ficha; manual: use $SHA, definido no A10) |

## Como preencher a ficha
- Início da amostra: a hora do commit de merge, lida com `git log -1 --format=%cI <sha>` (se vier em UTC, subtrair 3 h). O relógio do site e o print são só conferência.
- tempo_total_s: do início da amostra (acima) até o horário do último 200 do smoke mais a duração dele (Get-History e log do smoke em BRT; o history da EC2 está em UTC, subtrair 3 h). Na modalidade pipeline, o mesmo intervalo: do início da amostra (hora do commit de merge, via git log -1 --format=%cI) ao último 200 do smoke.
- comandos: soma dos D (PC + EC2, incluindo ssh); erro digitado ou retentativa = 1 intervenção + 1 comando extra.
- intervencoes: tudo fora do roteiro. dados_sensiveis_manuais: senhas/chaves digitadas à mão.
- chamadas_smoke: chamadas 2xx do smoke naquele incremento (núcleo 3 + 1 por incremento).
- image_version: Image Version do runner do último run (cabeçalho "Set up job").
- sha_merge: SHA do commit de merge na main.
- arquivos_alterados, linhas_alteradas, testes_novos: do git diff --stat do PR e da contagem de testes novos.
- nao_e_amostra: "sim" para ensaios, merges de documentação e de ajuste de pipeline; vazio para as 10 amostras.
- Mascarar qualquer segredo antes de salvar históricos.

## Limitação a declarar
O commit de merge das amostras manuais tem [skip ci] e por isso não tem execução própria do pipeline.
