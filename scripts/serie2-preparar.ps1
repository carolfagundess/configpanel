<#
.SYNOPSIS
  Prepara uma entrega da serie 2 da PoC: branch, commit (vazio ou marcador), push, PR e espera dos checks.
  NAO faz merge: o merge (Squash and merge) e feito pela Carol, no navegador.

.DESCRIPTION
  Passos:
    1) exige arvore limpa, branch main e main igual a origin/main;
    2) confere a alternancia estrita pipeline/manual pela ultima linha de docs/ficha-coleta-serie2.csv
       e recusa um Id que ja esteja na ficha;
    3) recusa se houver outro PR aberto da serie 2 (branch serie2/e*);
    4) cria a branch serie2/e<Id>-<modalidade>-<gatilho> a partir de origin/main;
    5) gatilho "vazio": git commit --allow-empty (0 arquivos);
       gatilho "marcador": troca a linha de backend/src/marcador-deploy.js por serie2-<Id> (1 arquivo, +1 -1);
    6) push, gh pr create e conferencia do diff do PR (0/0/0 ou 1/+1/-1);
    7) espera os checks obrigatorios (test-backend e build-docker) e o mergeStateStatus CLEAN;
    8) volta para a main e imprime a URL do PR e o que fazer no merge.

  O commit da branch nunca leva a flag de pular CI (os checks obrigatorios ficariam pendentes).
  Na modalidade manual, a flag e digitada a mao no titulo do squash, como na serie 1.
  O gh so e chamado com "pr create", "pr view", "pr list" e "pr checks"; "merge" e recusado.
  Compativel com Windows PowerShell 5.1 e PowerShell 7. Arquivo em ASCII puro de proposito.

.PARAMETER Id
  4 caracteres [A-Z0-9], sempre do mesmo tamanho (ex.: C001 a C004 na calibracao, 0001 em diante nas amostras).
  Vira o valor do marcador (serie2-<Id>) quando o gatilho e "marcador".
.PARAMETER Modalidade
  pipeline ou manual.
.PARAMETER Gatilho
  vazio (commit vazio) ou marcador (1 linha em backend/src/marcador-deploy.js).
.PARAMETER IgnorarAlternancia
  Pula a conferencia de alternancia (ex.: repetir uma entrega invalidada). Registrar o motivo nas observacoes.

.EXAMPLE
  .\scripts\serie2-preparar.ps1 -Id C001 -Modalidade pipeline -Gatilho vazio
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Z0-9]{4}$')]
    [string]$Id,

    [Parameter(Mandatory = $true)]
    [ValidateSet('pipeline', 'manual')]
    [string]$Modalidade,

    [Parameter(Mandatory = $true)]
    [ValidateSet('vazio', 'marcador')]
    [string]$Gatilho,

    [switch]$IgnorarAlternancia
)

$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ficha = Join-Path $raiz 'docs\ficha-coleta-serie2.csv'
$caminhoMarcador = 'backend/src/marcador-deploy.js'
$padraoMarcador = "(?m)^export const MARCADOR_DEPLOY = 'serie2-[A-Z0-9]{4}';"

function Invoke-Git {
    param([string[]]$GitArgs)
    $saida = & git @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "git falhou (codigo $LASTEXITCODE) em: git $($GitArgs -join ' ')" }
    return ($saida -join "`n")
}

function Invoke-Gh {
    param([string[]]$GhArgs)
    $permitido = $GhArgs.Count -ge 2 -and $GhArgs[0] -eq 'pr' -and @('create', 'view', 'list', 'checks') -contains $GhArgs[1]
    if ($GhArgs -contains 'merge') { $permitido = $false }
    if (-not $permitido) { throw "chamada ao gh nao permitida: gh $($GhArgs[0]) $($GhArgs[1])" }
    $saida = & gh @GhArgs
    if ($LASTEXITCODE -ne 0) { throw "gh falhou (codigo $LASTEXITCODE) em: gh $($GhArgs[0]) $($GhArgs[1])" }
    return ($saida -join "`n")
}

$branch = "serie2/e$($Id.ToLower())-$Modalidade-$Gatilho"
$titulo = "serie2: entrega $Id ($Modalidade, gatilho $Gatilho)"
$criouBranch = $false

Push-Location $raiz
try {
    # 1) Arvore limpa, na main, igual a origin/main.
    if (Invoke-Git @('status', '--porcelain')) { throw 'a arvore de trabalho nao esta limpa (git status); PARE' }
    $atual = Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')
    if ($atual -ne 'main') { throw "a branch atual e '$atual'; rode a partir da main" }
    Invoke-Git @('fetch', '--quiet', 'origin', 'main') | Out-Null
    if ((Invoke-Git @('rev-parse', 'HEAD')) -ne (Invoke-Git @('rev-parse', 'origin/main'))) {
        throw 'a main local difere de origin/main; rode git pull --ff-only'
    }

    # 2) Alternancia estrita e Id inedito, pela ficha v2.
    if (-not (Test-Path -LiteralPath $ficha)) { throw "ficha nao encontrada: docs\ficha-coleta-serie2.csv" }
    $linhas = @(Import-Csv -LiteralPath $ficha -Encoding UTF8)
    if (@($linhas | Where-Object { $_.id -eq $Id }).Count -gt 0) { throw "o Id $Id ja esta na ficha v2" }
    if ($linhas.Count -gt 0) {
        $anterior = $linhas[$linhas.Count - 1]
        if ($anterior.modalidade -eq $Modalidade -and -not $IgnorarAlternancia) {
            throw "a ultima entrega da ficha ($($anterior.id)) tambem e $Modalidade; a alternancia e estrita (use -IgnorarAlternancia so com motivo registrado)"
        }
    }

    # 3) Nenhum outro PR da serie 2 aberto.
    $abertos = @((Invoke-Gh @('pr', 'list', '--state', 'open', '--json', 'number,headRefName')) | ConvertFrom-Json |
        Where-Object { $_.headRefName -like 'serie2/e*' })
    if ($abertos.Count -gt 0) { throw "ha PR da serie 2 aberto: #$($abertos[0].number) ($($abertos[0].headRefName)); mergeie ou feche antes" }

    # 4) Branch nova, local e remota.
    & git show-ref --verify --quiet "refs/heads/$branch"
    if ($LASTEXITCODE -eq 0) { throw "a branch $branch ja existe localmente" }
    if (Invoke-Git @('ls-remote', '--heads', 'origin', $branch)) { throw "a branch $branch ja existe no GitHub" }
    Invoke-Git @('switch', '--quiet', '-c', $branch, 'origin/main') | Out-Null
    $criouBranch = $true

    # 5) Commit do gatilho.
    if ($Gatilho -eq 'vazio') {
        Invoke-Git @('commit', '--quiet', '--allow-empty', '-m', $titulo) | Out-Null
    }
    else {
        $arquivo = Join-Path $raiz $caminhoMarcador
        $texto = [System.IO.File]::ReadAllText($arquivo)
        $m = [regex]::Match($texto, $padraoMarcador)
        if (-not $m.Success) { throw "linha do marcador nao encontrada em $caminhoMarcador" }
        $nova = "export const MARCADOR_DEPLOY = 'serie2-$Id';"
        if ($m.Value -eq $nova) { throw "o marcador ja vale serie2-$Id; escolha outro Id" }
        $texto = $texto.Substring(0, $m.Index) + $nova + $texto.Substring($m.Index + $m.Length)
        [System.IO.File]::WriteAllText($arquivo, $texto, (New-Object System.Text.UTF8Encoding($false)))
        Invoke-Git @('add', '--', $caminhoMarcador) | Out-Null
        $numstat = Invoke-Git @('diff', '--cached', '--numstat')
        if ($numstat -ne "1`t1`t$caminhoMarcador") { throw "diff inesperado do marcador: $numstat" }
        Invoke-Git @('commit', '--quiet', '-m', $titulo) | Out-Null
    }

    # 6) Push, PR e conferencia do diff.
    Invoke-Git @('push', '--quiet', '-u', 'origin', $branch) | Out-Null
    $lembrete = if ($Modalidade -eq 'manual') {
        'Modalidade manual: no Squash and merge, digitar a flag de pular CI (colchetes, minusculas) no fim do TITULO do commit.'
    }
    else {
        'Modalidade pipeline: Squash and merge sem alterar o titulo.'
    }
    $corpo = "Entrega $Id da serie 2 da PoC (modalidade $Modalidade, gatilho $Gatilho), preparada por scripts/serie2-preparar.ps1.`n`n$lembrete`n`nDepois do merge: scripts/serie2-coleta.ps1 -Id $Id -Modalidade $Modalidade -Sha <sha do merge>, antes do proximo deploy."
    $url = Invoke-Gh @('pr', 'create', '--base', 'main', '--head', $branch, '--title', $titulo, '--body', $corpo)
    $pr = (Invoke-Gh @('pr', 'view', $branch, '--json', 'number')) | ConvertFrom-Json
    $numero = [string]$pr.number

    $esperado = if ($Gatilho -eq 'vazio') { '0/0/0' } else { '1/1/1' }
    $diff = ''
    for ($i = 0; $i -lt 6; $i++) {
        $v = (Invoke-Gh @('pr', 'view', $numero, '--json', 'changedFiles,additions,deletions')) | ConvertFrom-Json
        $diff = "$($v.changedFiles)/$($v.additions)/$($v.deletions)"
        if ($diff -eq $esperado) { break }
        Start-Sleep -Seconds 5
    }
    if ($diff -ne $esperado) { throw "o PR #$numero tem diff $diff (arquivos/+/-); esperado $esperado. Feche o PR" }

    # 7) Checks obrigatorios e mergeStateStatus.
    Write-Host "PR #$numero aberto; esperando os checks obrigatorios..."
    $registrados = $false
    for ($i = 0; $i -lt 12 -and -not $registrados; $i++) {
        $null = & gh pr checks $numero --required 2>$null
        # 0 = todos passaram; 8 = pendentes. Qualquer um dos dois indica que os checks ja foram registrados.
        if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 8) { $registrados = $true } else { Start-Sleep -Seconds 5 }
    }
    if (-not $registrados) { throw "os checks do PR #$numero nao apareceram em 60 s" }
    & gh pr checks $numero --required --watch --fail-fast --interval 10
    if ($LASTEXITCODE -ne 0) { throw "checks obrigatorios do PR #$numero falharam" }

    $estado = ''
    for ($i = 0; $i -lt 12; $i++) {
        $estado = ((Invoke-Gh @('pr', 'view', $numero, '--json', 'mergeStateStatus')) | ConvertFrom-Json).mergeStateStatus
        if ($estado -eq 'CLEAN') { break }
        Start-Sleep -Seconds 5
    }
    if ($estado -ne 'CLEAN') { throw "o PR #$numero esta com mergeStateStatus $estado (esperado CLEAN)" }

    # 8) Volta para a main.
    Invoke-Git @('switch', '--quiet', 'main') | Out-Null
    $criouBranch = $false
    Write-Host ''
    Write-Host "PRONTO (sem merge): $url"
    Write-Host "Titulo: $titulo"
    Write-Host $lembrete
    Write-Host "Depois do merge: .\scripts\serie2-coleta.ps1 -Id $Id -Modalidade $Modalidade -Sha <sha do merge>  (antes do proximo deploy)"
}
catch {
    [Console]::Error.WriteLine('ERRO: ' + $_.Exception.Message)
    if ($criouBranch) { [Console]::Error.WriteLine("Voce esta na branch $branch; confira o estado antes de rodar de novo.") }
    exit 1
}
finally {
    Pop-Location
}
