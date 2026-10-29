<#
.SYNOPSIS
  Gera a linha da ficha da serie 2 (docs/ficha-coleta-serie2.csv) de uma entrega ja mergeada, lendo o log da EC2.

.DESCRIPTION
  Somente leitura no GitHub, na AWS e na EC2: usa "gh run view/list" e "gh api" com GET, "aws ecr describe-images"
  e "aws ecr batch-get-image", e UM comando SSH fixo (docker inspect, docker logs, df). Nao escreve na ficha.
  Grava localmente, por padrao, as linhas [req] do log do container como evidencia, porque o log some no deploy
  seguinte (docker rm). Por isso, rode este script ANTES do proximo deploy.

  Inicio: hora do commit de merge (committer date do GitHub, precisao de 1 s).
  Fim: para cada ponto de leitura, a primeira linha [req] 2xx daquela rota depois do StartedAt do container,
  nas duas fontes (horario do middleware e horario do docker logs --timestamps, ambos do relogio da EC2):
    p08 = POST  /protocols/:id/comunicacoes          (passo 8 do smoke)
    p10 = GET   /protocols/:id/checklist             (passo 10)
    p12 = PATCH /protocols/:id/checklist/:itemId     (passo 12)
    p13 = GET   /protocols/:id/history               (passo 13; equivale ao fim= da serie 1; metrica principal)

  Saida: tabela legivel (Write-Host) e UMA linha CSV no fluxo de saida, na ordem do cabecalho da ficha v2.
  Credenciais e IP: o IP da EC2 vem de -Ec2Ip ou $env:EC2_IP e nunca e impresso.
  Compativel com Windows PowerShell 5.1 e PowerShell 7. Arquivo em ASCII puro de proposito.

.PARAMETER Id
  Id da entrega (4 caracteres, o mesmo do serie2-preparar.ps1).
.PARAMETER Modalidade
  pipeline ou manual (conferida contra os runs do commit de merge).
.PARAMETER Sha
  SHA do commit de merge na main (7 a 40 caracteres).
.PARAMETER SmokeOk
  Modalidade manual: resultado do smoke rodado no PC (sim ou nao). No pipeline vem do log do job.
.PARAMETER NaoEhAmostra
  Marca nao_e_amostra=sim (calibracao).
.PARAMETER Calibracao
  Acrescenta o relatorio de calibracao (duracao dos steps ou dos comandos, digests, camadas enviadas e baixadas),
  impresso e gravado em docs/evidencias-serie2/<Id>-<sha7>-calibracao.txt.
.PARAMETER HistoricoXml
  Calibracao manual: arquivo de Get-History | Export-Clixml, para a duracao de docker build, login e push.
.PARAMETER DuracaoPullS
  Calibracao manual: valor "real" do time no docker pull da EC2, em segundos (ex.: 4.21).
.PARAMETER SemEvidencia
  Nao grava o arquivo de evidencia (ex.: ao gerar de novo a linha de uma entrega ja coletada).
.PARAMETER AutoTeste
  Roda os casos de teste simulados das funcoes de calculo (sem rede) e sai.

.EXAMPLE
  $env:EC2_IP = "<IP_DA_EC2>"
  .\scripts\serie2-coleta.ps1 -Id C001 -Modalidade pipeline -Sha 1a2b3c4 -NaoEhAmostra -Calibracao
#>
[CmdletBinding(DefaultParameterSetName = 'Coleta')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Coleta')]
    [ValidatePattern('^[A-Z0-9]{4}$')]
    [string]$Id,

    [Parameter(Mandatory = $true, ParameterSetName = 'Coleta')]
    [ValidateSet('pipeline', 'manual')]
    [string]$Modalidade,

    [Parameter(Mandatory = $true, ParameterSetName = 'Coleta')]
    [ValidatePattern('^[0-9a-f]{7,40}$')]
    [string]$Sha,

    [Parameter(ParameterSetName = 'Coleta')]
    [ValidateSet('', 'sim', 'nao')]
    [string]$SmokeOk = '',

    [Parameter(ParameterSetName = 'Coleta')]
    [string]$Ec2Ip = $env:EC2_IP,

    [Parameter(ParameterSetName = 'Coleta')]
    [string]$ChaveSsh = (Join-Path $HOME '.ssh\configpanel-key.pem'),

    [Parameter(ParameterSetName = 'Coleta')]
    [string]$Ambiente = 'PC+EC2 (casa)',

    [Parameter(ParameterSetName = 'Coleta')]
    [switch]$NaoEhAmostra,

    [Parameter(ParameterSetName = 'Coleta')]
    [switch]$Calibracao,

    [Parameter(ParameterSetName = 'Coleta')]
    [string]$HistoricoXml = '',

    [Parameter(ParameterSetName = 'Coleta')]
    [string]$DuracaoPullS = '',

    [Parameter(ParameterSetName = 'Coleta')]
    [switch]$SemEvidencia,

    [Parameter(Mandatory = $true, ParameterSetName = 'Teste')]
    [switch]$AutoTeste
)

$ErrorActionPreference = 'Stop'
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$regiao = 'us-east-2'
$repoEcr = 'configpanel-backend'
$container = 'configpanel-backend'
$caminhoMarcador = 'backend/src/marcador-deploy.js'

# Pontos de leitura do fim (rota no formato do middleware).
$pontos = @(
    [pscustomobject]@{ Nome = 'p08'; Metodo = 'POST'; Rota = '/protocols/:id/comunicacoes' },
    [pscustomobject]@{ Nome = 'p10'; Metodo = 'GET'; Rota = '/protocols/:id/checklist' },
    [pscustomobject]@{ Nome = 'p12'; Metodo = 'PATCH'; Rota = '/protocols/:id/checklist/:itemId' },
    [pscustomobject]@{ Nome = 'p13'; Metodo = 'GET'; Rota = '/protocols/:id/history' }
)

# Os 13 passos do smoke (scripts/smoke.ps1), na ordem.
$passosSmoke = @(
    'GET /health', 'POST /auth/login', 'GET /protocols',
    'POST /protocols/:id/ips', 'GET /protocols/:id/ips',
    'GET /protocols/:id/equipamentos', 'POST /protocols/:id/equipamentos',
    'POST /protocols/:id/comunicacoes', 'GET /protocols/:id/comunicacoes',
    'GET /protocols/:id/checklist', 'POST /protocols/:id/checklist',
    'PATCH /protocols/:id/checklist/:itemId', 'GET /protocols/:id/history'
)

# ---------- funcoes de calculo (puras, testaveis sem rede) ----------

# Instante UTC de um texto ISO 8601 (aceita mais de 7 casas decimais, como o docker logs).
function ConvertTo-UtcDate {
    param([string]$Texto)
    $t = [regex]::Replace($Texto.Trim(), '(\.\d{7})\d+', '$1')
    $estilo = [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal
    return [datetime]::Parse($t, $inv, $estilo)
}

function Format-Utc {
    param([datetime]$Utc, [string]$Casas = 'fff')
    return $Utc.ToString("yyyy-MM-dd'T'HH:mm:ss.$($Casas)'Z'", $inv)
}

function Format-Segundos {
    param([double]$Segundos)
    return $Segundos.ToString('0.000', $inv)
}

# Linhas do docker logs --timestamps filtradas por [req]: "<ts docker> [req] <ts middleware> <metodo> <rota> <status>".
function Read-LinhasReq {
    param([string[]]$Linhas)
    $saida = New-Object System.Collections.Generic.List[object]
    foreach ($l in $Linhas) {
        $m = [regex]::Match($l, '^(\S+) \[req\] (\S+) ([A-Z]+) (\S+) (\d{3})\s*$')
        if (-not $m.Success) { continue }
        $saida.Add([pscustomobject]@{
                Docker = (ConvertTo-UtcDate $m.Groups[1].Value)
                Mw     = (ConvertTo-UtcDate $m.Groups[2].Value)
                Metodo = $m.Groups[3].Value
                Rota   = $m.Groups[4].Value
                Status = [int]$m.Groups[5].Value
                Bruta  = $l
            })
    }
    return , $saida.ToArray()
}

# Primeira linha 2xx de metodo+rota com horario do docker >= StartedAt; $null se nao houver.
function Get-PrimeiroFim {
    param($Req, [string]$Metodo, [string]$Rota, [datetime]$Desde)
    $c = @($Req | Where-Object { $_.Metodo -eq $Metodo -and $_.Rota -eq $Rota -and $_.Status -ge 200 -and $_.Status -lt 300 -and $_.Docker -ge $Desde } |
        Sort-Object Docker)
    if ($c.Count -eq 0) { return $null }
    return [pscustomobject]@{ Linha = $c[0]; Quantas = $c.Count }
}

# Quantos dos 13 passos do smoke tem ao menos uma linha 2xx desde o StartedAt.
function Get-Passos2xx {
    param($Req, [string[]]$Passos, [datetime]$Desde)
    $n = 0
    foreach ($p in $Passos) {
        $partes = $p.Split(' ')
        if (Get-PrimeiroFim $Req $partes[0] $partes[1] $Desde) { $n++ }
    }
    return $n
}

# Saida de docker pull ou docker push (sem TTY): uma linha "<12 hex>: <estado>" por camada.
# Aceita prefixo de horario do log do GitHub e "out: "/"err: " do ssh-action.
function Read-Camadas {
    param([string[]]$Linhas)
    $r = New-Object System.Collections.Generic.List[object]
    foreach ($l in $Linhas) {
        $m = [regex]::Match($l, '\b([0-9a-f]{12}): (Pull complete|Already exists|Pushed|Layer already exists)\s*$')
        if ($m.Success) { $r.Add([pscustomobject]@{ Curto = $m.Groups[1].Value; Estado = $m.Groups[2].Value }) }
    }
    return , $r.ToArray()
}

# Instante de uma linha do log de job do GitHub ("2026-10-28T23:56:45.1234567Z texto"); $null se nao tiver.
function Get-TsLinhaGh {
    param([string]$Linha)
    $m = [regex]::Match($Linha, '^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z) ')
    if (-not $m.Success) { return $null }
    return (ConvertTo-UtcDate $m.Groups[1].Value)
}

# Duracao entre a primeira linha que casa com $Inicio e a primeira posterior que casa com $Fim (log do GitHub).
function Get-DuracaoTrecho {
    param([string[]]$Linhas, [string]$Inicio, [string]$Fim)
    $ti = $null
    foreach ($l in $Linhas) {
        if ($null -eq $ti) {
            if ($l -match $Inicio) { $ti = Get-TsLinhaGh $l }
        }
        elseif ($l -match $Fim) {
            $tf = Get-TsLinhaGh $l
            if ($tf) { return ($tf - $ti).TotalSeconds }
        }
    }
    return $null
}

# Valor "Version:" do bloco "Runner Image" (igual ao coleta-pipeline.ps1).
function Get-ImageVersion {
    param([string]$Log)
    $m = [regex]::Match($Log, '(?s)##\[group\]Runner Image[ \t]*\r?\n.*?Version:\s*(\S+)')
    if ($m.Success) { return $m.Groups[1].Value }
    return ''
}

# Gatilho a partir dos arquivos e linhas do commit de merge.
function Get-Gatilho {
    param([string[]]$Arquivos, [int]$Adicoes, [int]$Remocoes)
    if ($Arquivos.Count -eq 0) { return 'vazio' }
    if ($Arquivos.Count -eq 1 -and $Arquivos[0] -eq $caminhoMarcador -and $Adicoes -eq 1 -and $Remocoes -eq 1) { return 'marcador' }
    return 'outro'
}

function Format-CsvCampo {
    param($Valor)
    $s = if ($null -eq $Valor) { '' } else { [string]$Valor }
    if ($s -match '[",\r\n]') { return '"' + $s.Replace('"', '""') + '"' }
    return $s
}

# ---------- autoteste (casos simulados, sem rede) ----------

if ($AutoTeste) {
    $falhas = 0
    function Assert-Igual {
        param([string]$Nome, $Esperado, $Obtido)
        if ("$Esperado" -ceq "$Obtido") { Write-Host "  ok    $Nome" }
        else { Write-Host "  FALHA $Nome (esperado '$Esperado', obtido '$Obtido')"; $script:falhas++ }
    }
    Write-Host 'Autoteste de serie2-coleta.ps1'

    $ini = ConvertTo-UtcDate '2026-10-28T23:59:30Z'
    $start = ConvertTo-UtcDate '2026-10-29T00:00:40.123456789Z'
    Assert-Igual 'docker ts com 9 casas' '2026-10-29T00:00:40.123456Z' (Format-Utc $start 'ffffff')

    $log = @(
        '2026-10-29T00:00:35.000000001Z [req] 2026-10-29T00:00:35.000Z GET /protocols/:id/history 200',
        '2026-10-29T00:00:41.000000000Z [req] 2026-10-29T00:00:41.000Z GET /health 200',
        '2026-10-29T00:00:50.100200300Z [req] 2026-10-29T00:00:50.099Z POST /protocols/:id/comunicacoes 201',
        '2026-10-29T00:00:51.000000000Z [req] 2026-10-29T00:00:51.000Z GET /protocols/:id/history 401',
        '2026-10-29T00:00:52.500000000Z [req] 2026-10-29T00:00:52.498Z GET /protocols/:id/history 200',
        '2026-10-29T00:00:59.000000000Z [req] 2026-10-29T00:00:59.000Z GET /protocols/:id/history 200',
        'Backend ConfigPanel rodando na porta 3001'
    )
    $req = Read-LinhasReq $log
    Assert-Igual 'linhas [req] reconhecidas' '6' $req.Count
    $f = Get-PrimeiroFim $req 'GET' '/protocols/:id/history' $start
    Assert-Igual 'p13: ignora linha antes do StartedAt e o 401' '2026-10-29T00:00:52.498Z' (Format-Utc $f.Linha.Mw)
    Assert-Igual 'p13: duas linhas 2xx depois do start' '2' $f.Quantas
    Assert-Igual 'p13: tempo middleware (virada de dia)' '82.498' (Format-Segundos ($f.Linha.Mw - $ini).TotalSeconds)
    Assert-Igual 'p13: tempo docker' '82.500' (Format-Segundos ($f.Linha.Docker - $ini).TotalSeconds)
    $f = Get-PrimeiroFim $req 'POST' '/protocols/:id/comunicacoes' $start
    Assert-Igual 'p08: 201 conta como 2xx' '2026-10-29T00:00:50.100200Z' (Format-Utc $f.Linha.Docker 'ffffff')
    Assert-Igual 'ponto ausente' 'True' ($null -eq (Get-PrimeiroFim $req 'PATCH' '/protocols/:id/checklist/:itemId' $start))
    Assert-Igual 'passos 2xx do smoke' '3' (Get-Passos2xx $req $passosSmoke $start)

    $pull = @(
        '2026-10-29T00:00:20.0000000Z out: latest: Pulling from configpanel-backend',
        '2026-10-29T00:00:20.1000000Z out: 2d35ebdb57d9: Already exists',
        '2026-10-29T00:00:21.0000000Z out: 7f9a1b2c3d4e: Pull complete',
        '2026-10-29T00:00:23.5000000Z out: Status: Downloaded newer image for x/configpanel-backend:latest'
    )
    $c = Read-Camadas $pull
    Assert-Igual 'pull: camadas' '2' $c.Count
    Assert-Igual 'pull: baixadas' '7f9a1b2c3d4e' (@($c | Where-Object { $_.Estado -eq 'Pull complete' }).Curto -join ',')
    Assert-Igual 'pull: duracao pelo log do GitHub' '3.5' (Get-DuracaoTrecho $pull 'Pulling from' 'Status: (Downloaded newer image|Image is up to date)')
    $c = Read-Camadas @('abcdefabcdef: Pushed', '0123456789ab: Layer already exists', 'latest: digest: sha256:00 size: 1')
    Assert-Igual 'push: estados' 'Pushed|Layer already exists' (($c | ForEach-Object { $_.Estado }) -join '|')

    Assert-Igual 'gatilho vazio' 'vazio' (Get-Gatilho @() 0 0)
    Assert-Igual 'gatilho marcador' 'marcador' (Get-Gatilho @('backend/src/marcador-deploy.js') 1 1)
    Assert-Igual 'gatilho outro' 'outro' (Get-Gatilho @('backend/src/app.js') 1 1)
    $logImg = "##[group]Runner Image Provisioner`nVersion: 111`n##[endgroup]`n##[group]Runner Image`nImage: ubuntu-24.04`nVersion: 222.3`n##[endgroup]"
    Assert-Igual 'versao da imagem (ignora Provisioner)' '222.3' (Get-ImageVersion $logImg)
    Assert-Igual 'csv com virgula e aspas' '"a,""b"""' (Format-CsvCampo 'a,"b"')

    if ($falhas -gt 0) { Write-Host "$falhas caso(s) falharam."; exit 1 }
    Write-Host 'Todos os casos passaram.'
    exit 0
}

# ---------- acesso externo (somente leitura) ----------

function Invoke-GhLeitura {
    param([string[]]$GhArgs)
    $permitido = $false
    if ($GhArgs.Count -ge 2 -and $GhArgs[0] -eq 'run' -and ($GhArgs[1] -eq 'view' -or $GhArgs[1] -eq 'list')) { $permitido = $true }
    if ($GhArgs.Count -ge 2 -and $GhArgs[0] -eq 'api') { $permitido = $true }
    foreach ($a in $GhArgs) {
        # Qualquer flag que mude o metodo HTTP ou envie corpo e proibida (gh api vira POST com -f/-F/--input).
        if ($a -match '^(-X|--method|-f|-F|--field|--raw-field|--input|--log|--rerun|--cancel)(=|$)') { $permitido = $false }
    }
    if (-not $permitido) { throw "chamada ao gh nao permitida (apenas leitura): gh $($GhArgs[0]) $($GhArgs[1])" }
    $saida = & gh @GhArgs
    if ($LASTEXITCODE -ne 0) { throw "gh falhou (codigo $LASTEXITCODE) em: gh $($GhArgs[0]) $($GhArgs[1])" }
    return ($saida -join "`n")
}

function Invoke-AwsLeitura {
    param([string[]]$AwsArgs)
    $permitido = $AwsArgs.Count -ge 2 -and $AwsArgs[0] -eq 'ecr' -and @('describe-images', 'batch-get-image') -contains $AwsArgs[1]
    if (-not $permitido) { throw "chamada a aws nao permitida (apenas leitura): aws $($AwsArgs[0]) $($AwsArgs[1])" }
    $saida = & aws @AwsArgs --region $regiao --output json
    if ($LASTEXITCODE -ne 0) { throw "aws falhou (codigo $LASTEXITCODE) em: aws $($AwsArgs[0]) $($AwsArgs[1])" }
    return (($saida -join "`n") | ConvertFrom-Json)
}

function Get-LogJob {
    param([long]$JobId)
    return (Invoke-GhLeitura @('api', "repos/{owner}/{repo}/actions/jobs/$JobId/logs"))
}

# Manifestos do ECR por digest (lotes de 100). Devolve hashtable digest -> manifesto (objeto).
$tiposManifesto = @(
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.oci.image.index.v1+json'
)
function Get-Manifestos {
    param([string[]]$Digests)
    $r = @{}
    for ($i = 0; $i -lt $Digests.Count; $i += 100) {
        $lote = @($Digests[$i..([math]::Min($i + 99, $Digests.Count - 1))] | ForEach-Object { "imageDigest=$_" })
        $resp = Invoke-AwsLeitura (@('ecr', 'batch-get-image', '--repository-name', $repoEcr, '--accepted-media-types') + $tiposManifesto + @('--image-ids') + $lote)
        foreach ($img in @($resp.images)) { $r[$img.imageId.imageDigest] = ($img.imageManifest | ConvertFrom-Json) }
    }
    return $r
}

# ---------- coleta ----------

try {
    if (-not $Ec2Ip) { throw 'informe -Ec2Ip ou defina $env:EC2_IP' }
    if (-not (Test-Path -LiteralPath $ChaveSsh)) { throw 'chave SSH nao encontrada (-ChaveSsh)' }

    $raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $ficha = Join-Path $raiz 'docs\ficha-coleta-serie2.csv'
    if (-not (Test-Path -LiteralPath $ficha)) { throw 'ficha nao encontrada: docs\ficha-coleta-serie2.csv' }
    $colunas = @((Get-Content -LiteralPath $ficha -Encoding UTF8 -TotalCount 1).TrimStart([char]0xFEFF).Trim().Split(','))

    $avisos = New-Object System.Collections.Generic.List[string]
    $falhas = New-Object System.Collections.Generic.List[string]
    $relatorio = New-Object System.Collections.Generic.List[string]

    # Commit de merge.
    $jq = '{sha:.sha,c:.commit.committer.date,cn:.commit.committer.name,cl:.committer.login,msg:.commit.message,np:(.parents|length),a:.stats.additions,d:.stats.deletions,files:[.files[].filename]}'
    $commit = (Invoke-GhLeitura @('api', "repos/{owner}/{repo}/commits/$Sha", '--jq', $jq)) | ConvertFrom-Json
    $shaCompleto = [string]$commit.sha
    $sha7 = $shaCompleto.Substring(0, 7)
    $inicio = ConvertTo-UtcDate ([string]$commit.c)
    $titulo = ([string]$commit.msg).Split("`n")[0]
    $naMain = (Invoke-GhLeitura @('api', "repos/{owner}/{repo}/compare/$shaCompleto...main", '--jq', '.status')).Trim()
    if (@('identical', 'ahead') -notcontains $naMain) { throw "o commit $sha7 nao esta na main (compare: $naMain)" }
    if ($commit.cl -ne 'web-flow') { $avisos.Add("committer nao e web-flow ($($commit.cn)/$($commit.cl)): o horario pode nao ser do servidor do GitHub") }
    if ([int]$commit.np -ne 1) { $avisos.Add("commit com $($commit.np) pais (esperado 1, squash)") }
    $arquivos = @($commit.files)
    $gatilho = Get-Gatilho $arquivos ([int]$commit.a) ([int]$commit.d)
    if ($gatilho -eq 'outro') { $falhas.Add('commit de merge nao e gatilho neutro (vazio ou marcador)') }
    $temSkip = $titulo -match '\[skip ci\]'
    if ($Modalidade -eq 'pipeline' -and $temSkip) { $falhas.Add('entrega pipeline com a flag de pular CI no titulo') }
    if ($Modalidade -eq 'manual' -and -not $temSkip) { $falhas.Add('entrega manual sem a flag de pular CI no titulo') }

    # Runs de push na main para o commit.
    $runs = @((Invoke-GhLeitura @('run', 'list', '--commit', $shaCompleto, '--json', 'databaseId,event,headBranch,status,conclusion,number', '--limit', '20')) | ConvertFrom-Json |
        Where-Object { $_.event -eq 'push' -and $_.headBranch -eq 'main' })
    $run = $null
    $runId = ''
    $imageVersion = ''
    $smoke = $SmokeOk
    if ($Modalidade -eq 'pipeline') {
        if ($runs.Count -ne 1) { throw "esperado 1 run de push para $sha7, encontrados $($runs.Count)" }
        $runId = [string]$runs[0].databaseId
        $run = (Invoke-GhLeitura @('run', 'view', $runId, '--json', 'attempt,status,conclusion,number,jobs')) | ConvertFrom-Json
        if ($run.status -ne 'completed') { throw "o run $runId ainda nao terminou (status: $($run.status))" }
        if ($run.conclusion -ne 'success') { $falhas.Add("run $runId com conclusao $($run.conclusion)") }
        if ([int]$run.attempt -gt 1) { $avisos.Add("reexecucao (tentativa $($run.attempt))") }
        $jobSmoke = @($run.jobs | Where-Object { $_.name -eq 'Smoke test' })[0]
        if ($jobSmoke) {
            $logSmoke = Get-LogJob ([long]$jobSmoke.databaseId)
            $imageVersion = Get-ImageVersion $logSmoke
            if ($logSmoke -match 'SMOKE OK') { $smoke = 'sim' } elseif ($logSmoke -match 'SMOKE FALHOU') { $smoke = 'nao' }
        }
        else { $avisos.Add('run sem job de smoke') }
    }
    else {
        if ($runs.Count -gt 0) { $falhas.Add("entrega manual com run de push na main (#$($runs[0].number)): a flag de pular CI nao funcionou") }
        if (-not $SmokeOk) { $avisos.Add('smoke_ok vazio: informe -SmokeOk sim ou nao (resultado do smoke no PC)') }
    }
    if ($smoke -eq 'nao') { $falhas.Add('smoke falhou') }

    # EC2: um unico comando fixo, so leitura. O pull de calibracao manual (~/serie2-pull.txt) so e lido com -Calibracao.
    $remoto = 'C=configpanel-backend; echo ==INSPECT; docker inspect -f ''{{.State.StartedAt}} {{.Image}}'' $C; echo ==DIGESTS; docker image inspect -f ''{{range .RepoDigests}}{{println .}}{{end}}'' $(docker inspect -f ''{{.Image}}'' $C); echo ==DF; df -P / | tail -n 1; echo ==REQ; docker logs --timestamps $C 2>&1 | grep -F ''[req]''; echo ==PULL; stat -c %Y ~/serie2-pull.txt 2>/dev/null; cat ~/serie2-pull.txt 2>/dev/null; echo ==FIM'
    $saidaSsh = @(& ssh -i $ChaveSsh -o BatchMode=yes -o ConnectTimeout=15 "ubuntu@$Ec2Ip" $remoto)
    if ($LASTEXITCODE -ne 0) { throw "ssh falhou (codigo $LASTEXITCODE)" }
    if (($saidaSsh -join "`n") -notmatch '==FIM') { throw 'saida do ssh incompleta' }
    $secoes = @{}
    $atual = $null
    foreach ($l in $saidaSsh) {
        if ($l -match '^==(INSPECT|DIGESTS|DF|REQ|PULL|FIM)$') { $atual = $Matches[1]; $secoes[$atual] = New-Object System.Collections.Generic.List[string]; continue }
        if ($atual) { $secoes[$atual].Add($l) }
    }
    if ($secoes['INSPECT'].Count -eq 0 -or $secoes['INSPECT'][0] -notmatch '^\S+ sha256:') { throw "container $container nao encontrado na EC2" }
    $partesInspect = ([string]$secoes['INSPECT'][0]).Split(' ')
    $startedAt = ConvertTo-UtcDate $partesInspect[0]
    $imagemId = $partesInspect[1]
    $repoDigest = @($secoes['DIGESTS'] | Where-Object { $_ -match "/$repoEcr@sha256:" } | ForEach-Object { $_.Split('@')[1] })
    $disco = ''
    if ($secoes['DF'].Count -gt 0) { $disco = (([string]$secoes['DF'][0]) -split '\s+')[4] }
    if ($startedAt -lt $inicio) { $falhas.Add('container iniciado antes do commit de merge: o deploy desta entrega nao aconteceu') }

    # Fins por ponto de leitura.
    $req = Read-LinhasReq ([string[]]$secoes['REQ'])
    $valoresPontos = @{}
    foreach ($p in $pontos) {
        $f = Get-PrimeiroFim $req $p.Metodo $p.Rota $startedAt
        if (-not $f) {
            $falhas.Add("sem linha 2xx de $($p.Metodo) $($p.Rota) ($($p.Nome))")
            continue
        }
        if ($f.Quantas -gt 1) { $avisos.Add("$($p.Nome) com $($f.Quantas) linhas 2xx (smoke rodou mais de uma vez?); usada a primeira") }
        $valoresPontos["fim_$($p.Nome)_mw_utc"] = Format-Utc $f.Linha.Mw
        $valoresPontos["fim_$($p.Nome)_docker_utc"] = Format-Utc $f.Linha.Docker 'ffffff'
        $valoresPontos["tempo_$($p.Nome)_mw_s"] = Format-Segundos ($f.Linha.Mw - $inicio).TotalSeconds
        $valoresPontos["tempo_$($p.Nome)_docker_s"] = Format-Segundos ($f.Linha.Docker - $inicio).TotalSeconds
    }
    $passos2xx = Get-Passos2xx $req $passosSmoke $startedAt

    # Imagem: digest da tag <sha> no ECR deve ser o da imagem em execucao.
    $imgEcr = $null
    try { $imgEcr = @((Invoke-AwsLeitura @('ecr', 'describe-images', '--repository-name', $repoEcr, '--image-ids', "imageTag=$shaCompleto")).imageDetails)[0] }
    catch { $imgEcr = $null }
    $digest = ''
    if ($imgEcr) {
        $digest = [string]$imgEcr.imageDigest
        if ($repoDigest -notcontains $digest) { $falhas.Add('a imagem em execucao na EC2 nao e a da tag deste commit no ECR') }
        if ((ConvertTo-UtcDate ([string]$imgEcr.imagePushedAt)) -lt $inicio) { $avisos.Add('digest da tag ja existia no ECR antes do merge (imagem identica a uma anterior)') }
    }
    else { $falhas.Add("tag $sha7 nao encontrada no ECR") }

    # Evidencia: linhas [req] brutas.
    $dirEvid = Join-Path $raiz 'docs\evidencias-serie2'
    $arqReq = Join-Path $dirEvid "$Id-$sha7-req.log"
    if (-not $SemEvidencia) {
        if (Test-Path -LiteralPath $arqReq) { throw "evidencia ja existe ($Id-$sha7-req.log); use -SemEvidencia para so gerar a linha" }
        New-Item -ItemType Directory -Force -Path $dirEvid | Out-Null
        $cab = "# serie 2, entrega $Id ($Modalidade, $gatilho), merge $sha7, container StartedAt $(Format-Utc $startedAt 'ffffff')"
        [System.IO.File]::WriteAllLines($arqReq, [string[]](@($cab) + @($req | ForEach-Object { $_.Bruta })), (New-Object System.Text.UTF8Encoding($false)))
    }

    # ---------- calibracao ----------
    if ($Calibracao) {
        $relatorio.Add("CALIBRACAO entrega $Id ($Modalidade, gatilho $gatilho), merge $sha7")
        $relatorio.Add("committer: $($commit.cn) / $($commit.cl); pais: $($commit.np); arquivos: $($arquivos.Count); titulo: $titulo")
        $relatorio.Add("runs de push na main para o commit: $($runs.Count)")
        $relatorio.Add("digest ECR (tag $sha7): $digest; imagem em execucao (id local): $imagemId")
        if ($imgEcr) { $relatorio.Add("imagePushedAt: $($imgEcr.imagePushedAt); tamanho ECR: $($imgEcr.imageSizeInBytes) bytes; tags: $(@($imgEcr.imageTags) -join ',')") }

        # Camadas do manifesto (resolve indice OCI do Docker Desktop para o manifesto linux/amd64).
        $camadas = @()
        $digestsDestaEntrega = @($digest)
        if ($digest) {
            $man = (Get-Manifestos @($digest))[$digest]
            if ($man.manifests) {
                $filho = @($man.manifests | Where-Object { $_.platform.os -eq 'linux' -and $_.platform.architecture -eq 'amd64' })[0]
                $digestsDestaEntrega += @($man.manifests | ForEach-Object { $_.digest })
                $relatorio.Add("formato: indice ($($man.mediaType)) com $(@($man.manifests).Count) manifesto(s); imagem linux/amd64: $($filho.digest)")
                $man = (Get-Manifestos @($filho.digest))[$filho.digest]
            }
            else { $relatorio.Add("formato: manifesto simples ($($man.mediaType))") }
            $relatorio.Add("config: $($man.config.digest)")
            $camadas = @($man.layers)
        }

        # Camadas novas no ECR: as que nao aparecem em nenhum manifesto enviado antes desta entrega.
        $novas = @{}
        if ($imgEcr) {
            $pushedAt = ConvertTo-UtcDate ([string]$imgEcr.imagePushedAt)
            $todas = @((Invoke-AwsLeitura @('ecr', 'describe-images', '--repository-name', $repoEcr)).imageDetails)
            $antes = @($todas | Where-Object { (ConvertTo-UtcDate ([string]$_.imagePushedAt)) -lt $pushedAt -and $digestsDestaEntrega -notcontains $_.imageDigest } | ForEach-Object { $_.imageDigest })
            $conhecidas = @{}
            if ($antes.Count -gt 0) {
                $ms = Get-Manifestos $antes
                foreach ($k in $ms.Keys) { foreach ($ly in @($ms[$k].layers)) { if ($ly) { $conhecidas[$ly.digest] = $true } } }
            }
            foreach ($ly in $camadas) { if (-not $conhecidas.ContainsKey($ly.digest)) { $novas[$ly.digest] = $true } }
        }

        # Camadas baixadas na EC2 (saida do docker pull).
        $linhasPull = @()
        $duracaoPull = $null
        if ($Modalidade -eq 'pipeline' -and $run) {
            $jobDeploy = @($run.jobs | Where-Object { $_.name -eq 'Deploy to EC2' })[0]
            $jobPush = @($run.jobs | Where-Object { $_.name -eq 'push-to-ecr' })[0]
            if ($jobDeploy) {
                $logDeploy = (Get-LogJob ([long]$jobDeploy.databaseId)) -split "`n"
                $linhasPull = $logDeploy
                $duracaoPull = Get-DuracaoTrecho $logDeploy 'Pulling from' 'Status: (Downloaded newer image|Image is up to date)'
            }
            if ($jobPush) {
                $logPush = (Get-LogJob ([long]$jobPush.databaseId)) -split "`n"
                $cPush = Read-Camadas $logPush
                $relatorio.Add("push (log do job): $(@($cPush | Where-Object { $_.Estado -eq 'Pushed' }).Count) Pushed, $(@($cPush | Where-Object { $_.Estado -eq 'Layer already exists' }).Count) Layer already exists (somando os 2 docker push)")
                $dBuild = Get-DuracaoTrecho $logPush 'docker build -t' 'The push refers to repository'
                $dPush = Get-DuracaoTrecho $logPush 'The push refers to repository' ":$shaCompleto\: digest: sha256:"
                $relatorio.Add("duracao no log do push-to-ecr: build ~$(if ($null -ne $dBuild) { Format-Segundos $dBuild } else { '?' }) s; os 2 push ~$(if ($null -ne $dPush) { Format-Segundos $dPush } else { '?' }) s")
            }
            $relatorio.Add('steps do run (startedAt/completedAt, precisao de 1 s):')
            foreach ($j in @($run.jobs)) {
                foreach ($s in @($j.steps)) {
                    if (-not $s.startedAt -or -not $s.completedAt -or $s.startedAt -like '0001-*') { continue }
                    $d = ((ConvertTo-UtcDate $s.completedAt) - (ConvertTo-UtcDate $s.startedAt)).TotalSeconds
                    $relatorio.Add(('  {0,-14} | {1,-45} | {2,4} s | {3}' -f $j.name, $s.name, $d, $s.conclusion))
                }
            }
        }
        elseif ($Modalidade -eq 'manual') {
            $pull = @($secoes['PULL'])
            if ($pull.Count -gt 0 -and $pull[0] -match '^\d+$') {
                $mtime = [datetime]::new(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc).AddSeconds([double]$pull[0])
                if ($mtime -lt $inicio -or $mtime -gt $startedAt) { $avisos.Add('~/serie2-pull.txt nao e desta entrega (horario fora do intervalo merge -> StartedAt)') }
                elseif ($pull.Count -gt 1) { $linhasPull = $pull[1..($pull.Count - 1)] }
            }
            else { $avisos.Add('~/serie2-pull.txt ausente: rode o B6 de calibracao com tee') }
            if ($DuracaoPullS) { $duracaoPull = [double]::Parse($DuracaoPullS, $inv) }
            if ($HistoricoXml) {
                $hist = @(Import-Clixml -LiteralPath $HistoricoXml)
                $relatorio.Add('comandos do PC (Get-History, EndExecutionTime - StartExecutionTime):')
                foreach ($h in $hist) {
                    $cmd = [string]$h.CommandLine
                    $rotulo = $null
                    if ($cmd -match '^\s*docker build ') { $rotulo = 'A11 docker build' }
                    elseif ($cmd -match '^\s*aws ecr get-login-password') { $rotulo = 'A12 login ECR' }
                    elseif ($cmd -match '^\s*docker push .*:latest') { $rotulo = 'A13 docker push latest' }
                    elseif ($cmd -match '^\s*docker push ') { $rotulo = 'A14 docker push sha' }
                    if ($rotulo) {
                        $d = ($h.EndExecutionTime - $h.StartExecutionTime).TotalSeconds
                        $relatorio.Add(('  Id {0,4} | {1,-24} | {2} s' -f $h.Id, $rotulo, (Format-Segundos $d)))
                    }
                }
            }
            else { $avisos.Add('sem -HistoricoXml: duracoes de build e push do PC fora do relatorio') }
        }
        $cPull = Read-Camadas ([string[]]$linhasPull)
        $baixadas = @{}
        foreach ($c in $cPull) { if ($c.Estado -eq 'Pull complete') { $baixadas[$c.Curto] = $true } }
        $relatorio.Add("pull na EC2: $($baixadas.Count) camada(s) baixada(s), $(@($cPull | Where-Object { $_.Estado -eq 'Already exists' }).Count) ja existente(s); duracao: $(if ($null -ne $duracaoPull) { Format-Segundos $duracaoPull } else { '?' }) s")
        $bytesNovas = 0
        $bytesBaixados = 0
        $relatorio.Add('camadas da imagem (digest, tamanho comprimido, nova no ECR, baixada na EC2):')
        foreach ($ly in $camadas) {
            $curto = ([string]$ly.digest).Substring(7, 12)
            $nova = $novas.ContainsKey($ly.digest)
            $baixada = $baixadas.ContainsKey($curto)
            if ($nova) { $bytesNovas += [long]$ly.size }
            if ($baixada) { $bytesBaixados += [long]$ly.size }
            $relatorio.Add(('  {0} | {1,10} | {2,-3} | {3}' -f $curto, $ly.size, $(if ($nova) { 'sim' } else { 'nao' }), $(if ($baixada) { 'sim' } else { 'nao' })))
        }
        $relatorio.Add("total: $($novas.Count) camada(s) nova(s) no ECR ($bytesNovas bytes); $($baixadas.Count) baixada(s) na EC2 ($bytesBaixados bytes)")
        $relatorio.Add("disco da EC2 (/): $disco")
    }

    # Observacoes.
    $obs = New-Object System.Collections.Generic.List[string]
    if ($NaoEhAmostra) { $obs.Add('Fora das amostras (calibracao)') }
    if ($run) { $obs.Add("Run #$($run.number)") }
    $obs.Add("titulo do squash: $titulo")
    foreach ($a in $avisos) { $obs.Add($a) }

    $valores = @{
        id                      = $Id
        modalidade              = $Modalidade
        gatilho                 = $gatilho
        nao_e_amostra           = $(if ($NaoEhAmostra) { 'sim' } else { 'nao' })
        sha_merge               = $sha7
        inicio_merge_utc        = (Format-Utc $inicio)
        inicio_brt              = $inicio.AddHours(-3).ToString('yyyy-MM-dd HH:mm:ss', $inv)
        run_id                  = $runId
        container_started_utc   = (Format-Utc $startedAt 'ffffff')
        passos_2xx_log          = $passos2xx
        smoke_ok                = $smoke
        comandos                = $(if ($Modalidade -eq 'pipeline') { 0 } else { '' })
        intervencoes            = $(if ($Modalidade -eq 'pipeline') { 0 } else { '' })
        dados_sensiveis_manuais = $(if ($Modalidade -eq 'pipeline') { 0 } else { '' })
        falha                   = $(if ($falhas.Count -gt 0) { 'sim' } else { 'nao' })
        tipo_falha              = ($falhas -join '; ')
        image_digest            = $digest
        image_version           = $imageVersion
        arquivos_alterados      = $arquivos.Count
        linhas_alteradas        = ([int]$commit.a + [int]$commit.d)
        disco_ec2_uso           = $disco
        ambiente                = $(if ($Modalidade -eq 'pipeline') { 'GitHub Actions' } else { $Ambiente })
        observacoes             = ($obs -join '. ')
    }
    foreach ($k in $valoresPontos.Keys) { $valores[$k] = $valoresPontos[$k] }

    $campos = foreach ($col in $colunas) {
        if ($valores.ContainsKey($col)) { Format-CsvCampo $valores[$col] } else { '' }
    }

    # Saida legivel.
    Write-Host ''
    Write-Host "Entrega $Id | $Modalidade | gatilho $gatilho | merge $sha7 em $(Format-Utc $inicio) | container $(Format-Utc $startedAt 'ffffff')"
    foreach ($p in $pontos) {
        $k = "tempo_$($p.Nome)_mw_s"
        if ($valores.ContainsKey($k)) {
            Write-Host ('  {0} {1,-6} {2,-34} mw {3} s | docker {4} s' -f $p.Nome, $p.Metodo, $p.Rota, $valores[$k], $valores["tempo_$($p.Nome)_docker_s"])
        }
        else { Write-Host ('  {0} {1,-6} {2,-34} SEM LINHA 2xx' -f $p.Nome, $p.Metodo, $p.Rota) }
    }
    Write-Host "  passos do smoke com 2xx no log: $passos2xx/13 | linhas [req]: $($req.Count) | disco: $disco"
    if ($falhas.Count -gt 0) { Write-Host ('  FALHA: ' + ($falhas -join '; ')) }
    foreach ($a in $avisos) { Write-Host "  aviso: $a" }
    if (-not $SemEvidencia) { Write-Host "  evidencia: docs\evidencias-serie2\$Id-$sha7-req.log" }
    if ($Calibracao) {
        Write-Host ''
        foreach ($l in $relatorio) { Write-Host $l }
        $arqCal = Join-Path $dirEvid "$Id-$sha7-calibracao.txt"
        if (-not $SemEvidencia) {
            New-Item -ItemType Directory -Force -Path $dirEvid | Out-Null
            [System.IO.File]::WriteAllLines($arqCal, [string[]]$relatorio, (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "  relatorio: docs\evidencias-serie2\$Id-$sha7-calibracao.txt"
        }
    }
    Write-Output ($campos -join ',')
}
catch {
    [Console]::Error.WriteLine('ERRO: ' + $_.Exception.Message)
    exit 1
}
