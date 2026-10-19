<#
.SYNOPSIS
  Smoke test do ConfigPanel: /health, /auth/login, /protocols, POST /protocols/<id>/ips, GET /protocols/<id>/ips, GET /protocols/<id>/equipamentos, POST /protocols/<id>/equipamentos, POST /protocols/<id>/comunicacoes e GET /protocols/<id>/comunicacoes.

.DESCRIPTION
  Roda nove requisicoes em sequencia e imprime, para cada uma, o horario
  (Brasilia e UTC), metodo e caminho, status e tempo em ms. Sem retry e com
  timeout de 10 s por requisicao. Nao grava nada em disco e nunca imprime
  a senha nem o token.

  O passo 4 grava de verdade um IP (192.0.2.1, faixa de documentacao RFC 5737) no protocolo de teste
  de client_name "SMOKE TESTE", localizado na lista do passo 3. Se esse protocolo nao existir, o smoke falha.
  O passo 7 grava de verdade um equipamento (SMOKE-ONU, MAC 00:00:5E:00:53:01, faixa de documentacao RFC 7042) no mesmo protocolo.
  O passo 8 grava de verdade uma comunicacao com o cliente (client_communications) no mesmo protocolo.
  O passo 9 le as comunicacoes do mesmo protocolo e confere que a gravada no passo 8 aparece.

  Credenciais: $env:SMOKE_USER e $env:SMOKE_PASS; se faltarem, pede com Read-Host.
  Exit code: 0 se tudo passou, 1 se algum passo falhou.

.PARAMETER BaseUrl
  URL base da API (ex.: http://host:3001). Padrao: $env:CONFIGPANEL_URL.

.EXAMPLE
  $env:CONFIGPANEL_URL = "http://<EC2_HOST>:3001"
  .\scripts\smoke.ps1
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = $env:CONFIGPANEL_URL
)

$ErrorActionPreference = 'Stop'
$timeoutSec = 10

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    [Console]::Error.WriteLine('ERRO: informe -BaseUrl ou defina a variavel de ambiente CONFIGPANEL_URL (ex.: http://<EC2_HOST>:3001).')
    exit 1
}
$BaseUrl = $BaseUrl.TrimEnd('/')

# Credenciais (nunca impressas, nunca gravadas)
$user = $env:SMOKE_USER
if ([string]::IsNullOrEmpty($user)) { $user = Read-Host 'Usuario' }
$pass = $env:SMOKE_PASS
if ([string]::IsNullOrEmpty($pass)) {
    $secure = Read-Host 'Senha' -AsSecureString
    $pass = [System.Net.NetworkCredential]::new('', $secure).Password
}

function Get-Stamp {
    # Brasilia = UTC-3 (sem horario de verao desde 2019)
    $utc = [DateTime]::UtcNow
    $brt = $utc.AddHours(-3)
    $fmt = 'yyyy-MM-dd HH:mm:ss.fff'
    $ci = [System.Globalization.CultureInfo]::InvariantCulture
    'BRT {0} | UTC {1}' -f $brt.ToString($fmt, $ci), $utc.ToString($fmt, $ci)
}

# Executa uma requisicao, imprime a linha do passo e devolve @{ Ok; Status; Body }
function Invoke-Step {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        [string]$JsonBody = $null
    )
    $stamp = Get-Stamp
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $status = $null
    $content = $null
    $errMsg = $null
    try {
        $args2 = @{
            Uri             = "$BaseUrl$Path"
            Method          = $Method
            Headers         = $Headers
            TimeoutSec      = $timeoutSec
            UseBasicParsing = $true
        }
        if ($JsonBody) {
            $args2.ContentType = 'application/json'
            $args2.Body = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
        }
        $r = Invoke-WebRequest @args2
        $status = [int]$r.StatusCode
        $content = $r.Content
    }
    catch {
        $resp = $_.Exception.Response
        if ($resp) { $status = [int]$resp.StatusCode }
        else { $errMsg = $_.Exception.GetType().Name }
    }
    $sw.Stop()
    $ms = [int]$sw.Elapsed.TotalMilliseconds
    $shown = if ($null -ne $status) { "$status" } else { "sem resposta ($errMsg)" }
    Write-Host ('[{0}] {1} {2} -> {3} ({4} ms)' -f $stamp, $Method, $Path, $shown, $ms)
    @{ Ok = ($status -ge 200 -and $status -lt 300); Status = $status; Body = $content }
}

$total = [System.Diagnostics.Stopwatch]::StartNew()
$failed = $null
$calls2xx = 0

# Para acrescentar um passo: copie um bloco abaixo (ex.: o de GET /protocols), ajuste
# Method, Path, Headers e JsonBody, deixe-o em sequencia dentro de if (-not $failed)
# e mantenha o aceite 2xx ($r.Ok) e o incremento de $calls2xx.

# 1) GET /health
$r = Invoke-Step -Method GET -Path '/health'
if ($r.Ok) { $calls2xx++ }
if (-not $r.Ok) { $failed = 'GET /health' }

# 2) POST /auth/login
$token = $null
if (-not $failed) {
    $body = @{ username = $user; password = $pass } | ConvertTo-Json -Compress
    $r = Invoke-Step -Method POST -Path '/auth/login' -JsonBody $body
    if ($r.Ok) { $calls2xx++ }
    if ($r.Ok) {
        try { $token = ($r.Body | ConvertFrom-Json).token } catch { $token = $null }
        if ([string]::IsNullOrEmpty($token)) { $failed = 'POST /auth/login (resposta sem token)' }
    }
    else { $failed = 'POST /auth/login' }
}

# 3) GET /protocols
$listaBody = $null
if (-not $failed) {
    $r = Invoke-Step -Method GET -Path '/protocols?limit=200' -Headers @{ Authorization = "Bearer $token" }
    if ($r.Ok) { $calls2xx++ }
    if (-not $r.Ok) { $failed = 'GET /protocols' }
    else { $listaBody = $r.Body }
}

# 4) POST /protocols/<id>/ips (grava de verdade no protocolo de teste "SMOKE TESTE")
if (-not $failed) {
    $smokeId = $null
    try {
        $smokeProt = @(($listaBody | ConvertFrom-Json).rows) | Where-Object { $_.client_name -ceq 'SMOKE TESTE' } | Select-Object -First 1
        if ($smokeProt) { $smokeId = [string]$smokeProt.id }
    }
    catch { $smokeId = $null }
    if ([string]::IsNullOrEmpty($smokeId)) {
        $failed = 'POST /protocols/<id>/ips (protocolo "SMOKE TESTE" nao encontrado em GET /protocols)'
    }
    else {
        $body = @{ address = '192.0.2.1'; category = 'gerencia' } | ConvertTo-Json -Compress
        $r = Invoke-Step -Method POST -Path "/protocols/$smokeId/ips" -Headers @{ Authorization = "Bearer $token" } -JsonBody $body
        if ($r.Ok) { $calls2xx++ }
        if (-not $r.Ok) { $failed = 'POST /protocols/<id>/ips' }
    }
}

# 5) GET /protocols/<id>/ips (lê os IPs do protocolo de teste "SMOKE TESTE", reaproveitando o id do passo 4)
if (-not $failed) {
    $r = Invoke-Step -Method GET -Path "/protocols/$smokeId/ips" -Headers @{ Authorization = "Bearer $token" }
    if ($r.Ok) { $calls2xx++ }
    if (-not $r.Ok) { $failed = 'GET /protocols/<id>/ips' }
}

# 6) GET /protocols/<id>/equipamentos (lê os equipamentos do protocolo de teste "SMOKE TESTE", reaproveitando o id do passo 4)
if (-not $failed) {
    $r = Invoke-Step -Method GET -Path "/protocols/$smokeId/equipamentos" -Headers @{ Authorization = "Bearer $token" }
    if ($r.Ok) { $calls2xx++ }
    if (-not $r.Ok) { $failed = 'GET /protocols/<id>/equipamentos' }
}

# 7) POST /protocols/<id>/equipamentos (grava de verdade no protocolo de teste "SMOKE TESTE", reaproveitando o id do passo 4)
if (-not $failed) {
    $body = @{ model = 'SMOKE-ONU'; serial_number = 'SMOKE-SN-0001'; mac_address = '00:00:5E:00:53:01' } | ConvertTo-Json -Compress
    $r = Invoke-Step -Method POST -Path "/protocols/$smokeId/equipamentos" -Headers @{ Authorization = "Bearer $token" } -JsonBody $body
    if ($r.Ok) { $calls2xx++ }
    if (-not $r.Ok) { $failed = 'POST /protocols/<id>/equipamentos' }
}

# 8) POST /protocols/<id>/comunicacoes (grava de verdade no protocolo de teste "SMOKE TESTE", reaproveitando o id do passo 4)
if (-not $failed) {
    $comContent = 'SMOKE: contato de teste do smoke test'
    $body = @{ content = $comContent } | ConvertTo-Json -Compress
    $r = Invoke-Step -Method POST -Path "/protocols/$smokeId/comunicacoes" -Headers @{ Authorization = "Bearer $token" } -JsonBody $body
    if ($r.Ok) { $calls2xx++ }
    if (-not $r.Ok) { $failed = 'POST /protocols/<id>/comunicacoes' }
}

# 9) GET /protocols/<id>/comunicacoes (le as comunicacoes do protocolo de teste "SMOKE TESTE" e confere que a do passo 8 aparece, reaproveitando o id do passo 4)
if (-not $failed) {
    $r = Invoke-Step -Method GET -Path "/protocols/$smokeId/comunicacoes" -Headers @{ Authorization = "Bearer $token" }
    if ($r.Ok) { $calls2xx++ }
    if (-not $r.Ok) { $failed = 'GET /protocols/<id>/comunicacoes' }
    else {
        $achou = $null
        try { $achou = @(($r.Body | ConvertFrom-Json).rows) | Where-Object { $_.content -ceq $comContent } | Select-Object -First 1 }
        catch { $achou = $null }
        if (-not $achou) { $failed = 'GET /protocols/<id>/comunicacoes (comunicacao do passo 8 nao encontrada)' }
    }
}

$total.Stop()
$fim = Get-Stamp
$totalFmt = '{0:N1} s' -f $total.Elapsed.TotalSeconds
if ($failed) {
    Write-Host "SMOKE FALHOU no passo: $failed (tempo total: $totalFmt)"
    exit 1
}
Write-Host "SMOKE OK chamadas_2xx=$calls2xx fim=[$fim] (tempo total: $totalFmt)"
exit 0
