<#
.SYNOPSIS
    Remove o monblockd desta maquina e devolve o sistema ao estado de antes (so desenvolvimento, ate o W12 da F4).
.DESCRIPTION
    Idempotente: pode rodar de novo se parar no meio. Para e remove o servico, restaura o hosts do backup da
    instalacao conferindo o hash, remove os valores de politica gerenciados e apaga INSTALL_DIR e DATA_DIR.
    Em producao a remocao so acontece pela desinstalacao autorizada pelo Ajudante.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Continue'
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Execute como Administrador.' }

$installDir = Join-Path $env:ProgramFiles 'monBlock'
$dataDir = Join-Path $env:ProgramData 'monBlock'
$winsw = Join-Path $installDir 'monblockd-service.exe'
$report = [ordered]@{}

# 1. Servico.
if (Get-Service monblockd -ErrorAction SilentlyContinue) {
  if (Test-Path $winsw) { & $winsw stop | Out-Null; & $winsw uninstall | Out-Null } else { sc.exe stop monblockd | Out-Null; sc.exe delete monblockd | Out-Null }
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline -and (Get-Service monblockd -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 500 }
}
Get-Process monblockd -ErrorAction SilentlyContinue | Stop-Process -Force
$report.service = if (Get-Service monblockd -ErrorAction SilentlyContinue) { 'AINDA EXISTE' } else { 'removido' }

# 2. Hosts: restaura do backup e confere o hash, com novas tentativas (no P10 um Copy-Item travou).
$hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$backup = Join-Path $dataDir 'hosts.install.bak'
if (Test-Path $backup) {
  $want = (Get-Content "$backup.sha256" -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (-not $want) { $want = (Get-FileHash $backup -Algorithm SHA256).Hash }
  icacls $hosts /reset | Out-Null
  $ok = $false
  for ($i = 0; $i -lt 5 -and -not $ok; $i++) {
    try { [IO.File]::Copy($backup, $hosts, $true); $ok = (Get-FileHash $hosts -Algorithm SHA256).Hash -eq $want } catch { Start-Sleep -Seconds 1 }
  }
  $report.hosts = if ($ok) { 'restaurado (hash confere)' } else { 'FALHOU: hosts diferente do backup' }
} else {
  $report.hosts = 'sem backup da instalacao; nada restaurado'
}
icacls $hosts /reset | Out-Null
ipconfig /flushdns | Out-Null

# 3. Politicas gerenciadas (chaves raiz ficam, como antes da instalacao).
foreach ($k in 'Google\Chrome', 'Microsoft\Edge', 'BraveSoftware\Brave', 'Chromium', 'Vivaldi') {
  $key = "HKLM\SOFTWARE\Policies\$k"
  foreach ($sub in 'URLBlocklist', 'URLAllowlist') { reg delete "$key\$sub" /f 2>&1 | Out-Null }
  foreach ($v in 'DnsOverHttpsMode', 'IncognitoModeAvailability', 'InPrivateModeAvailability') { reg delete $key /v $v /f 2>&1 | Out-Null }
}
$ff = 'HKLM\SOFTWARE\Policies\Mozilla\Firefox'
foreach ($sub in 'WebsiteFilter', 'DNSOverHTTPS') { reg delete "$ff\$sub" /f 2>&1 | Out-Null }
reg delete $ff /v DisablePrivateBrowsing /f 2>&1 | Out-Null
$left = foreach ($k in 'Google\Chrome', 'Microsoft\Edge', 'BraveSoftware\Brave', 'Chromium', 'Vivaldi', 'Mozilla\Firefox') {
  (reg query "HKLM\SOFTWARE\Policies\$k" /s 2>&1 | Out-String).Trim() | Where-Object { $_ -match 'REG_' }
}
$report.registry = if ($left) { "SOBROU: $left" } else { 'limpo' }

# 4. Pastas.
Remove-Item $installDir, $dataDir -Recurse -Force -ErrorAction SilentlyContinue
$report.folders = if ((Test-Path $installDir) -or (Test-Path $dataDir)) { 'SOBROU pasta' } else { 'removidas' }

$report | Format-List | Out-String | Write-Host
