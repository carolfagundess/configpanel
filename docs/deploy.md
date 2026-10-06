# Deploy (AWS)

Estado verificado em 06/10/2026; itens da AWS conferidos pelo console em 24/09.

Como o backend chega à produção. Descreve o que o pipeline em [.github/workflows/ci.yml](../.github/workflows/ci.yml) faz e a infraestrutura que ele pressupõe. O histórico das decisões está em [devops-log.md](devops-log.md).

## Visão geral

```
push na main → test-backend → build-docker → push-to-ecr → deploy-to-ec2
                                                │                │
                                         Amazon ECR        SSH na EC2:
                                  (tags latest e SHA)   pull + stop/rm/run
```

Em pull requests rodam apenas `test-backend` e `build-docker`. `push-to-ecr` e `deploy-to-ec2` só executam em push na `main` (condição `github.event_name == 'push' && github.ref == 'refs/heads/main'`). Só código revisado e mergeado chega à produção.

## Infraestrutura

| Recurso | Detalhe |
|---------|---------|
| Região | `us-east-2` |
| Registry | Amazon ECR, repositório `configpanel-backend` |
| Servidor | EC2 com Docker, usuário SSH `ubuntu` |
| Rede Docker na EC2 | `configpanel-net` |
| Containers na EC2 | `configpanel-postgres` (banco) e `configpanel-backend` (API, porta `3001`) |
| Security Group | `configpanel-sg`, 5 regras de entrada; SSH (22) aberto a `0.0.0.0/0` para permitir os runners do GitHub Actions (ver "Limitações") |
| IAM | usuário `github-actions-deploy`, com permissões restritas ao necessário para o push no ECR |

A EC2 tem as credenciais AWS persistidas em `~/.aws/credentials`, usadas pelo `aws ecr get-login-password` durante o deploy.

## Secrets do repositório (GitHub)

| Secret | Uso |
|--------|-----|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credenciais do usuário `github-actions-deploy` (push no ECR) |
| `AWS_ACCOUNT_ID` | Monta a URL do registry ECR no passo de deploy |
| `EC2_HOST` | Endereço da EC2 |
| `EC2_SSH_PRIVATE_KEY` | Chave ed25519 **dedicada** ao GitHub Actions, separada da chave pessoal. Se for recriada, copie o arquivo inteiro para a área de transferência (não por seleção de texto no terminal, que quebra a formatação) |

## O que o job de deploy executa na EC2

1. `docker login` no ECR
2. `docker pull` da imagem `:latest`
3. `docker stop` e `docker rm` do container `configpanel-backend`
4. `docker run -d` do novo container, na rede `configpanel-net`, apontando para o banco em `configpanel-postgres:5432`

## Deploy manual (roteiro)

Equivalente ao job `deploy-to-ec2`, executado à mão. Os valores entre `<...>` são segredos ou dados do ambiente: busque-os onde estão guardados (chave `.pem` local, console da AWS, secrets do GitHub) e não os grave neste repositório.

```bash
# 1. No computador local: conectar na EC2
ssh -i <caminho-da-chave.pem> ubuntu@<EC2_HOST>

# 2. Na EC2: descobrir o ID da conta e autenticar o Docker no ECR
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region us-east-2 \
  | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com

# 3. Baixar a imagem nova
docker pull $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/configpanel-backend:latest

# 4. Remover o container antigo
docker stop configpanel-backend
docker rm configpanel-backend

# 5. Subir o container novo
docker run -d --name configpanel-backend --network configpanel-net \
  -e DB_HOST=configpanel-postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=configpanel \
  -e DB_USER=<DB_USER> \
  -e DB_PASSWORD=<DB_PASSWORD> \
  -e JWT_SECRET=<JWT_SECRET> \
  -e JWT_EXPIRES_IN=8h \
  -e PORT=3001 \
  -p 3001:3001 \
  $ACCOUNT_ID.dkr.ecr.us-east-2.amazonaws.com/configpanel-backend:latest

# 6. Validar
docker ps
docker logs configpanel-backend
curl http://localhost:3001/health
```

Os valores de `DB_USER`, `DB_PASSWORD` e `JWT_SECRET` devem ser os mesmos usados pelo container do Postgres e pelo `docker run` do `ci.yml`. Se o container anterior ainda estiver rodando, `docker inspect configpanel-backend` mostra as variáveis que ele usa.

## Validação pós-deploy

O endpoint `GET /health` existe e é público, mas o pipeline **não o consulta**: o job `deploy-to-ec2` termina quando o script SSH acaba, sem verificar se a API respondeu. A validação é, portanto, manual:

- `GET /health` deve retornar `{"status":"ok","projeto":"ConfigPanel"}`
- `GET /protocols` sem token deve retornar 401
- `POST /auth/login` deve retornar 200 com token

## Limitações conhecidas

- **Credenciais no script de deploy:** `DB_USER`, `DB_PASSWORD` e `JWT_SECRET` do container de produção estão escritos em texto no `ci.yml`. Deveriam vir de GitHub Secrets.
- **SSH aberto ao mundo (porta 22):** aceitável no ambiente de estudo; a autenticação depende só da chave.
- **Sem rollback automático nem health check:** o container antigo é removido antes de validar o novo, o que causa indisponibilidade breve e deixa a API fora do ar se a imagem nova falhar. A imagem `latest` é sobrescrita a cada deploy; a tag com o SHA do commit permite voltar manualmente a uma versão anterior.
- **Job verde não garante deploy correto:** `script_stop` está desligado (o padrão é `false` na `appleboy/ssh-action@v1.0.3`), então o script continua mesmo que um comando falhe, e o job pode terminar com sucesso apesar de, por exemplo, o `docker pull` ou o `docker run` ter dado erro.
- **IP público da EC2 não é fixo:** se a instância for reiniciada, o IP muda e o secret `EC2_HOST` precisa ser atualizado, ou o deploy deixa de conectar.
- **Postgres sem volume nomeado e sem backup:** o container `configpanel-postgres` foi criado com `docker run` sem `-v` (conforme o histórico do shell da EC2 em 17/09), então os dados ficam num volume anônimo, sem nome para reaproveitar. Recriar o container deixa o banco antigo órfão (ou o perde, se o volume for removido), e não há backup.
- **Migrations não rodam no pipeline:** o deploy não executa `npm run migrate`. Mudanças de schema precisam ser aplicadas à parte.
- **Banco e rede sem definição versionada:** o container `configpanel-postgres` e a rede `configpanel-net` não têm script ou compose no repositório que os crie; recriar o ambiente do zero hoje depende de conhecimento fora do repositório.
