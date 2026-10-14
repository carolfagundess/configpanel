<#
.SYNOPSIS
  Gera a linha de CSV da ficha de coleta (modalidade pipeline) a partir de um run do GitHub Actions.

.DESCRIPTION
  Somente leitura: usa apenas "gh run view --json" e "gh api" com GET. Nao faz rerun, cancel nem delete
  e nao escreve em docs/ficha-coleta.csv; apenas le o cabecalho dele para manter a ordem das colunas.

  Saida:
    1) uma tabela legivel (via Write-Host) com inicio, fim e duracao de cada job e do run;
    2) UMA linha CSV no fluxo de saida, na ordem do cabecalho de docs/ficha-coleta.csv.
  Assim, "> arquivo" ou "| Set-Clipboard" captura so a linha CSV.

  O log dos jobs e lido em memoria e nunca impresso; so os valores casados por regex sao usados.
  Compativel com Windows PowerShell 5.1 e PowerShell 7. Arquivo em ASCII puro de proposito.

.PARAMETER RunId
  ID numerico do run (ex.: 38192782924).
.PARAMETER Id
  Identificador da coleta na ficha (ex.: P01).
.PARAMETER Cenario
  Valor opcional da coluna cenario (vazio por padrao).
.PARAMETER NaoEhAmostra
  Marca nao_e_amostra=sim (ex.: runs #38 e #40, anteriores ao congelamento).
.PARAMETER AutoTeste
  Roda os casos de teste simulados das funcoes de calculo (sem chamar o gh) e sai.

.EXAMPLE
  .\scripts\coleta-pipeline.ps1 -RunId 38192782924 -Id P01 -NaoEhAmostra
#>
[CmdletBinding(DefaultParameterSetName = 'Coleta')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Coleta')]
    [ValidatePattern('^\d+$')]
    [string]$RunId,

    [Parameter(ParameterSetName = 'Coleta')]
    [string]$Id = '',

    [Parameter(ParameterSetName = 'Coleta')]
    [string]$Cenario = '',

    [Parameter(ParameterSetName = 'Coleta')]
    [switch]$NaoEhAmostra,

    [Parameter(Mandatory = $true, ParameterSetName = 'Teste')]
    [switch]$AutoTeste
)

$ErrorActionPreference = 'Stop'
$inv = [System.Globalization.CultureInfo]::InvariantCulture

# Colunas na ordem do cabecalho atual da ficha; usada so se o arquivo nao for encontrado.
$colunasPadrao = @(
    'id', 'cenario', 'modalidade', 'data_hora_inicio_brt', 'commit', 'run_id', 'ambiente',
    'tempo_total_s', 'comandos', 'intervencoes', 'dados_sensiveis_manuais', 'falha', 'tipo_falha',
    'smoke_ok', 'observacoes', 'chamadas_smoke', 'image_version', 'nao_e_amostra', 'sha_merge',
    'arquivos_alterados', 'linhas_alteradas', 'testes_novos'
)

# Arquivos de teste do repositorio (Jest em backend/tests/*.test.js).
$padraoArquivoTeste = '^backend/tests/.+\.test\.js$'
# Linha adicionada que declara um teste: it( ou test( (inclui it.only( / test.skip( ).
$padraoLinhaTeste = '^\+\s*(it|test)(\.(only|skip))?\s*\('

# ---------- funcoes de calculo (puras, testaveis sem rede) ----------

function ConvertTo-UtcDate {
    param($Valor)
    if ($Valor -is [datetime]) { return $Valor.ToUniversalTime() }
    $estilo = [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal
    return [datetime]::Parse([string]$Valor, $inv, $estilo)
}

function ConvertTo-BrtTexto {
    param([datetime]$Utc, [string]$Formato = 'yyyy-MM-dd HH:mm:ss')
    # BRT = UTC-3 fixo (o Brasil nao tem horario de verao); evita depender do id de fuso do sistema.
    return $Utc.AddHours(-3).ToString($Formato, $inv)
}

function Format-Duracao {
    param([double]$Segundos)
    $t = [int][math]::Round($Segundos, 0, [MidpointRounding]::AwayFromZero)
    return ('{0}m{1:00}s' -f [math]::Floor($t / 60), ($t % 60))
}

# Converte o "fim" impresso pelo smoke (UTC) em data/hora UTC.
# O smoke atual imprime "UTC AAAA-MM-DD HH:mm:ss.fff" (com data); se so vier a hora, assume o dia do
# inicio da amostra (commit de merge) e soma 1 dia quando o resultado ficaria antes dele (virada de dia em UTC).
function Get-FimUtc {
    param([string]$Data, [string]$Hora, [datetime]$InicioUtc)
    if ($Data) {
        $formatos = [string[]]@('yyyy-MM-dd HH:mm:ss.FFFFFFF', 'yyyy-MM-dd HH:mm:ss')
        $estilo = [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal
        return [datetime]::ParseExact(($Data + ' ' + $Hora), $formatos, $inv, $estilo)
    }
    $hora = [timespan]::Parse($Hora, $inv)
    $candidato = $InicioUtc.Date.Add($hora)
    if ($candidato -lt $InicioUtc) { $candidato = $candidato.AddDays(1) }
    return $candidato
}

# Le a linha final do smoke. Retorna $null se o log nao tiver SMOKE OK nem SMOKE FALHOU.
# Se for o formato antigo (sem chamadas_2xx/fim), Ok=$true e Chamadas/FimHora ficam $null.
function Read-SmokeLog {
    param([string]$Log)
    $r = [ordered]@{ Ok = $null; Chamadas = $null; FimData = $null; FimHora = $null }
    $ok = [regex]::Matches($Log, 'SMOKE OK chamadas_2xx=(\d+) fim=\[[^\]]*?UTC\s+(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]')
    if ($ok.Count -gt 0) {
        $m = $ok[$ok.Count - 1]
        $r.Ok = $true
        $r.Chamadas = [int]$m.Groups[1].Value
        $r.FimData = $m.Groups[2].Value
        $r.FimHora = $m.Groups[3].Value
        return [pscustomobject]$r
    }
    if ($Log -match 'SMOKE FALHOU') {
        $r.Ok = $false
        return [pscustomobject]$r
    }
    # Formato anterior ao PR #17: "SMOKE OK (tempo total: ...)", sem chamadas_2xx nem fim.
    if ($Log -match 'SMOKE OK') {
        $r.Ok = $true
        return [pscustomobject]$r
    }
    return $null
}

# Valor "Version:" do bloco "Runner Image" (nao o "Runner Image Provisioner").
function Get-ImageVersion {
    param([string]$Log)
    $m = [regex]::Match($Log, '(?s)##\[group\]Runner Image[ \t]*\r?\n.*?Version:\s*(\S+)')
    if ($m.Success) { return $m.Groups[1].Value }
    return ''
}

# Conta linhas adicionadas com it( ou test( nos patches dos arquivos de teste.
function Get-TestesNovos {
    param($Arquivos, [string]$PadraoArquivo, [string]$PadraoLinha)
    $total = 0
    $arquivosTeste = 0
    $semPatch = 0
    foreach ($f in $Arquivos) {
        if ($f.filename -notmatch $PadraoArquivo) { continue }
        $arquivosTeste++
        if ([string]::IsNullOrEmpty($f.patch)) { $semPatch++; continue }
        foreach ($linha in ($f.patch -split "`n")) {
            if ($linha.StartsWith('+++')) { continue }
            if ($linha -match $PadraoLinha) { $total++ }
        }
    }
    return [pscustomobject]@{ Total = $total; ArquivosTeste = $arquivosTeste; SemPatch = $semPatch }
}

# Segundos entre dois instantes, arredondados (metade para longe do zero).
function Get-SegundosArred {
    param([datetime]$Ini, [datetime]$Fim)
    return [int][math]::Round(($Fim - $Ini).TotalSeconds, 0, [MidpointRounding]::AwayFromZero)
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
    Write-Host 'Autoteste de coleta-pipeline.ps1'

    # O inicio da amostra e a hora do commit de merge (committer date), nao a criacao do run.
    # Virada de dia: commit 23:59:30 UTC, fim 00:01:10 (so a hora) => dia seguinte, 100 s depois.
    $c = ConvertTo-UtcDate '2026-10-11T23:59:30Z'
    $fim = Get-FimUtc -Data '' -Hora '00:01:10.000' -InicioUtc $c
    Assert-Igual 'virada de dia (so hora): data do fim' '2026-10-12 00:01:10' $fim.ToString('yyyy-MM-dd HH:mm:ss', $inv)
    Assert-Igual 'virada de dia (so hora): segundos' '100' (($fim - $c).TotalSeconds)
    # Mesmo caso, com a data presente no fim (formato atual do smoke).
    $fim = Get-FimUtc -Data '2026-10-12' -Hora '00:01:10.000' -InicioUtc $c
    Assert-Igual 'virada de dia (com data): segundos' '100' (($fim - $c).TotalSeconds)
    # Virada com atraso: commit 23:59:30, run criado 00:00:05 do dia seguinte, fim 00:01:10 (so a hora).
    $cr = ConvertTo-UtcDate '2026-10-12T00:00:05Z'
    Assert-Igual 'virada com atraso: atraso merge->run' '35' (Get-SegundosArred $c $cr)
    Assert-Igual 'virada com atraso: tempo_total_s (do commit)' '100' (Get-SegundosArred $c $fim)
    # Sem virada: commit 01:39:50, run criado 01:40:14 (atraso 24 s), fim 01:42:09.738 no mesmo dia.
    $c2 = ConvertTo-UtcDate '2026-10-12T01:39:50Z'
    $cr2 = ConvertTo-UtcDate '2026-10-12T01:40:14Z'
    $fim = Get-FimUtc -Data '' -Hora '01:42:09.738' -InicioUtc $c2
    Assert-Igual 'sem virada (so hora): data do fim' '2026-10-12 01:42:09' $fim.ToString('yyyy-MM-dd HH:mm:ss', $inv)
    $fim = Get-FimUtc -Data '2026-10-12' -Hora '01:42:09.738' -InicioUtc $c2
    Assert-Igual 'sem virada (com data): tempo_total_s do commit' '140' (Get-SegundosArred $c2 $fim)
    Assert-Igual 'sem virada: atraso merge->run' '24' (Get-SegundosArred $c2 $cr2)
    Assert-Igual 'sem virada: contado da criacao do run (regra antiga) seria' '116' (Get-SegundosArred $cr2 $fim)
    Assert-Igual 'BRT de 23:59:30 UTC' '2026-10-11 20:59:30' (ConvertTo-BrtTexto $c)
    Assert-Igual 'duracao 118 s' '1m58s' (Format-Duracao 118)

    # Linha do smoke e versao da imagem.
    $logSmoke = "2026-10-12T01:42:09.7Z SMOKE OK chamadas_2xx=3 fim=[BRT 2026-10-11 22:42:09.738 | UTC 2026-10-12 01:42:09.738] (tempo total: 2.8 s)"
    $s = Read-SmokeLog $logSmoke
    Assert-Igual 'smoke: chamadas' '3' $s.Chamadas
    Assert-Igual 'smoke: data UTC do fim' '2026-10-12' $s.FimData
    $s = Read-SmokeLog 'SMOKE OK chamadas_2xx=4 fim=[BRT 2026-10-11 21:00:00 | UTC 00:01:10.5]'
    Assert-Igual 'smoke: so hora (sem data)' '' $s.FimData
    $s = Read-SmokeLog 'SMOKE OK (tempo total: 2.0 s)'
    Assert-Igual 'smoke antigo: ok sem chamadas' 'True|' ([string]$s.Ok + '|' + [string]$s.Chamadas)
    Assert-Igual 'smoke: falhou' 'False' (Read-SmokeLog 'SMOKE FALHOU no passo: GET /health').Ok
    $logImg = "##[group]Runner Image Provisioner`nVersion: 111`n##[endgroup]`n##[group]Runner Image`nImage: ubuntu-24.04`nVersion: 222.3`n##[endgroup]"
    Assert-Igual 'versao da imagem (ignora Provisioner)' '222.3' (Get-ImageVersion $logImg)

    # Contagem de testes (so linhas adicionadas, so backend/tests/*.test.js).
    $arqs = @(
        [pscustomobject]@{ filename = 'backend/tests/a.test.js'; patch = "@@ -1 +1,4 @@`n+  it('x', () => {})`n+  test.only('y', () => {})`n-  it('antigo', () => {})`n+  const it = 1`n+++ b/x" },
        [pscustomobject]@{ filename = 'backend/src/b.js'; patch = "+  it('nao conta', () => {})" }
    )
    $t = Get-TestesNovos $arqs $padraoArquivoTeste $padraoLinhaTeste
    Assert-Igual 'testes novos' '2' $t.Total
    Assert-Igual 'csv com virgula e aspas' '"a,""b"""' (Format-CsvCampo 'a,"b"')

    if ($falhas -gt 0) { Write-Host "$falhas caso(s) falharam."; exit 1 }
    Write-Host 'Todos os casos passaram.'
    exit 0
}

# ---------- acesso ao gh (somente leitura) ----------

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

function Get-LogJob {
    param([long]$JobId)
    return (Invoke-GhLeitura @('api', "repos/{owner}/{repo}/actions/jobs/$JobId/logs"))
}

# ---------- coleta ----------

try {
    # Ordem das colunas: cabecalho de docs/ficha-coleta.csv (somente leitura).
    $colunas = $colunasPadrao
    $ficha = Join-Path $PSScriptRoot '..\docs\ficha-coleta.csv'
    if (Test-Path -LiteralPath $ficha) {
        $cab = (Get-Content -LiteralPath $ficha -Encoding UTF8 -TotalCount 1)
        if ($cab) {
            $colunas = @($cab.TrimStart([char]0xFEFF).Trim().Split(','))
        }
    }

    $run = (Invoke-GhLeitura @('run', 'view', $RunId, '--json', 'attempt,event,headBranch,headSha,createdAt,status,conclusion,number,jobs')) | ConvertFrom-Json

    if ($run.status -ne 'completed') { throw "o run $RunId nao terminou (status: $($run.status))" }
    if ($run.event -ne 'push') { throw "o run $RunId nao e de push (evento: $($run.event)); a coleta usa so runs de push na main" }
    if ($run.headBranch -ne 'main') { throw "o run $RunId nao e da branch main (branch: $($run.headBranch))" }

    $criacao = ConvertTo-UtcDate $run.createdAt
    $jobs = @($run.jobs | Sort-Object { ConvertTo-UtcDate $_.startedAt })

    # Tabela de jobs.
    $linhasTabela = @()
    $ultimoFim = $criacao
    foreach ($j in $jobs) {
        if (-not $j.startedAt -or -not $j.completedAt -or $j.startedAt -like '0001-*') {
            $linhasTabela += [pscustomobject]@{ Etapa = $j.name; Resultado = $j.conclusion; 'Inicio (BRT)' = '-'; 'Fim (BRT)' = '-'; 'Duracao' = '-' }
            continue
        }
        $ini = ConvertTo-UtcDate $j.startedAt
        $fimJob = ConvertTo-UtcDate $j.completedAt
        if ($fimJob -gt $ultimoFim) { $ultimoFim = $fimJob }
        $linhasTabela += [pscustomobject]@{
            Etapa = $j.name; Resultado = $j.conclusion
            'Inicio (BRT)' = (ConvertTo-BrtTexto $ini 'HH:mm:ss'); 'Fim (BRT)' = (ConvertTo-BrtTexto $fimJob 'HH:mm:ss')
            'Duracao' = (Format-Duracao ($fimJob - $ini).TotalSeconds)
        }
    }
    $duracaoRun = ($ultimoFim - $criacao).TotalSeconds
    $linhasTabela += [pscustomobject]@{
        Etapa = 'RUN (criacao ate o ultimo job)'; Resultado = $run.conclusion
        'Inicio (BRT)' = (ConvertTo-BrtTexto $criacao 'HH:mm:ss'); 'Fim (BRT)' = (ConvertTo-BrtTexto $ultimoFim 'HH:mm:ss')
        'Duracao' = (Format-Duracao $duracaoRun)
    }

    # Logs: smoke (linha final e imagem) e test-backend (imagem).
    $jobSmoke = $jobs | Where-Object { $_.name -eq 'Smoke test' } | Select-Object -First 1
    $jobTeste = $jobs | Where-Object { $_.name -eq 'test-backend' } | Select-Object -First 1
    $avisos = New-Object System.Collections.Generic.List[string]

    $smoke = $null
    $imgSmoke = ''
    if ($jobSmoke) {
        $logSmoke = Get-LogJob ([long]$jobSmoke.databaseId)
        $smoke = Read-SmokeLog $logSmoke
        $imgSmoke = Get-ImageVersion $logSmoke
        if (-not $smoke) { $avisos.Add('log do smoke sem linha final reconhecida') }
        elseif ($smoke.Ok -and -not $smoke.FimHora) { $avisos.Add('smoke no formato anterior ao PR #17 (sem chamadas_2xx e fim): tempo_total_s e chamadas_smoke vazios') }
    }
    else {
        $avisos.Add('run sem job de smoke')
    }
    $imgTeste = ''
    if ($jobTeste) {
        $imgTeste = Get-ImageVersion (Get-LogJob ([long]$jobTeste.databaseId))
    }

    $imageVersion = $imgSmoke
    if (-not $imageVersion) { $imageVersion = $imgTeste }
    if ($imgSmoke -and $imgTeste -and $imgSmoke -ne $imgTeste) {
        $avisos.Add("image_version diferente entre jobs: smoke=$imgSmoke; test-backend=$imgTeste")
    }

    # Commit de merge: hora do commit (committer date), arquivos, linhas e testes novos.
    $sha = [string]$run.headSha
    $jq = '{c:.commit.committer.date,a:.stats.additions,d:.stats.deletions,files:[.files[]|{filename:.filename,patch:.patch}]}'
    $commit = (Invoke-GhLeitura @('api', "repos/{owner}/{repo}/commits/$sha", '--jq', $jq)) | ConvertFrom-Json
    $inicio = ConvertTo-UtcDate $commit.c

    # Atraso entre o commit de merge e a criacao do run: so na tabela, fora do CSV.
    $atrasoS = ($criacao - $inicio).TotalSeconds
    $linhasTabela += [pscustomobject]@{
        Etapa = 'atraso merge->run'; Resultado = ''
        'Inicio (BRT)' = (ConvertTo-BrtTexto $inicio 'HH:mm:ss'); 'Fim (BRT)' = (ConvertTo-BrtTexto $criacao 'HH:mm:ss')
        'Duracao' = (Format-Duracao $atrasoS)
    }
    if ($atrasoS -lt 0) { $avisos.Add('commit de merge posterior a criacao do run (relogios?): conferir') }

    # Tempo total: hora do commit de merge ate o fim impresso pelo smoke.
    $tempoTotal = ''
    $fimSmokeTexto = ''
    if ($smoke -and $smoke.Ok -and $smoke.FimHora) {
        $fimSmoke = Get-FimUtc -Data $smoke.FimData -Hora $smoke.FimHora -InicioUtc $inicio
        $totalS = ($fimSmoke - $inicio).TotalSeconds
        $tempoTotal = Get-SegundosArred $inicio $fimSmoke
        $fimSmokeTexto = (ConvertTo-BrtTexto $fimSmoke 'HH:mm:ss.f').Replace('.', ',')
        $linhasTabela += [pscustomobject]@{
            Etapa = 'TOTAL (commit de merge ate o fim do smoke)'; Resultado = 'smoke ok'
            'Inicio (BRT)' = (ConvertTo-BrtTexto $inicio 'HH:mm:ss'); 'Fim (BRT)' = (ConvertTo-BrtTexto $fimSmoke 'HH:mm:ss')
            'Duracao' = (Format-Duracao $totalS)
        }
    }

    $arquivos = @($commit.files)
    $linhasAlteradas = [int]$commit.a + [int]$commit.d
    $testes = Get-TestesNovos $arquivos $padraoArquivoTeste $padraoLinhaTeste
    if ($arquivos.Count -ge 300) { $avisos.Add('lista de arquivos do commit truncada em 300') }
    if ($testes.SemPatch -gt 0) { $avisos.Add("$($testes.SemPatch) arquivo(s) de teste sem patch (contagem incompleta)") }

    # Falha.
    $falha = 'nao'
    $falhos = @($jobs | Where-Object { $_.conclusion -and $_.conclusion -ne 'success' -and $_.conclusion -ne 'skipped' })
    if ($run.conclusion -ne 'success' -or $falhos.Count -gt 0 -or ($smoke -and -not $smoke.Ok)) {
        $falha = 'sim'
        if ($falhos.Count -gt 0) { $avisos.Add('jobs com falha: ' + (($falhos | ForEach-Object { $_.name }) -join ' / ')) }
    }

    # Observacoes.
    $obs = New-Object System.Collections.Generic.List[string]
    if ($NaoEhAmostra) { $obs.Add('Fora das amostras') }
    $textoRun = "Run #$($run.number)"
    if ($fimSmokeTexto) { $textoRun += ", fim do smoke $fimSmokeTexto BRT" }
    $obs.Add($textoRun)
    $obs.Add('testes_novos e estimativa (linhas + com it( ou test( em backend/tests/*.test.js)')
    if ([int]$run.attempt -gt 1) { $obs.Add("reexecucao (tentativa $($run.attempt))") }
    foreach ($a in $avisos) { $obs.Add($a) }

    # Valores por coluna; o que nao da para calcular fica vazio.
    $valores = @{
        id                      = $Id
        cenario                 = $Cenario
        modalidade              = 'pipeline'
        data_hora_inicio_brt    = (ConvertTo-BrtTexto $inicio)
        commit                  = $sha.Substring(0, 7)
        run_id                  = $RunId
        ambiente                = 'GitHub Actions'
        tempo_total_s           = $tempoTotal
        comandos                = 0
        intervencoes            = 0
        dados_sensiveis_manuais = 0
        falha                   = $falha
        tipo_falha              = ''
        smoke_ok                = $(if ($smoke) { if ($smoke.Ok) { 'sim' } else { 'nao' } } else { '' })
        observacoes             = ($obs -join '. ')
        chamadas_smoke          = $(if ($smoke -and $smoke.Ok -and $null -ne $smoke.Chamadas) { $smoke.Chamadas } else { '' })
        image_version           = $imageVersion
        nao_e_amostra           = $(if ($NaoEhAmostra) { 'sim' } else { 'nao' })
        sha_merge               = $sha.Substring(0, 7)
        arquivos_alterados      = $arquivos.Count
        linhas_alteradas        = $linhasAlteradas
        testes_novos            = $testes.Total
    }

    $campos = foreach ($col in $colunas) {
        if ($valores.ContainsKey($col)) { Format-CsvCampo $valores[$col] } else { '' }
    }

    # Saida: tabela legivel (host) e depois UMA linha CSV (fluxo de saida).
    Write-Host ''
    Write-Host "Run $RunId (#$($run.number)) | evento: $($run.event) | branch: $($run.headBranch) | tentativa: $($run.attempt) | resultado: $($run.conclusion)"
    Write-Host ((($linhasTabela | Format-Table -AutoSize | Out-String).TrimEnd()))
    Write-Output ($campos -join ',')
}
catch {
    [Console]::Error.WriteLine('ERRO: ' + $_.Exception.Message)
    exit 1
}
