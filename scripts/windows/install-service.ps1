<#
.SYNOPSIS
    Instala e inicia o monblockd como servico do Windows (SYSTEM) via WinSW (W2, ADR-0016 D1).
.DESCRIPTION
    Copia build\windows\ para %ProgramFiles%\monBlock, prepara %ProgramData%\monBlock com ACL so de
    SYSTEM e Administradores, guarda um backup do hosts e registra o servico. Idempotente: reinstala por cima.
    Ate o instalador Inno da F4, este e o caminho de instalacao (e o que o teste real da F3 usa).
#>
[CmdletBinding()]
param([string]$SourceDir = (Join-Path $PSScriptRoot '..\..\build\windows'))
$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Execute como Administrador.' }

$SourceDir = (Resolve-Path $SourceDir).Path
foreach ($f in 'monblockd.exe', 'monblockd-service.exe', 'monblockd-service.xml', 'pipe-acl.ps1', 'pipe-server-check.ps1') {
  if (-not (Test-Path (Join-Path $SourceDir $f))) { throw "Falta $f em $SourceDir (rode scripts\build-daemon-sea.ps1)." }
}
$installDir = Join-Path $env:ProgramFiles 'monBlock'
$dataDir = Join-Path $env:ProgramData 'monBlock'
$winsw = Join-Path $installDir 'monblockd-service.exe'

# 1. Para o servico antigo, se houver, antes de sobrescrever o binario.
if (Get-Service monblockd -ErrorAction SilentlyContinue) {
  Write-Host 'Servico existente: parando e removendo para atualizar...'
  & $winsw stop | Out-Null
  & $winsw uninstall | Out-Null
  Start-Sleep -Seconds 2
}

# 2. Binarios e helpers. %ProgramFiles% herda ACL de admin: o usuario comum nao altera os .ps1 (W21 depende disso).
New-Item -ItemType Directory -Force $installDir | Out-Null
if ($SourceDir.TrimEnd('\') -ne $installDir.TrimEnd('\')) {
  Copy-Item (Join-Path $SourceDir '*') $installDir -Recurse -Force # pelo instalador Inno os arquivos ja estao no lugar
}

# 3. DATA_DIR so de SYSTEM e Administradores, sem heranca (o daemon confere de novo no boot, W20).
New-Item -ItemType Directory -Force $dataDir, (Join-Path $dataDir 'db'), (Join-Path $dataDir 'run'), (Join-Path $dataDir 'logs') | Out-Null
icacls $dataDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'icacls do DATA_DIR falhou' }

# 4. Backup do hosts original (uma vez), com hash, para a desinstalacao conferir.
$hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$backup = Join-Path $dataDir 'hosts.install.bak'
if (-not (Test-Path $backup)) {
  Copy-Item $hosts $backup
  (Get-FileHash $backup -Algorithm SHA256).Hash | Set-Content -Encoding ascii "$backup.sha256"
}

# 5. Registra e inicia.
& $winsw install
if ($LASTEXITCODE -ne 0) { throw 'WinSW install falhou' }
& $winsw start
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and (Get-Service monblockd).Status -ne 'Running') { Start-Sleep -Milliseconds 500 }
if ((Get-Service monblockd).Status -ne 'Running') { throw 'O servico nao ficou Running em 30 s (ver %ProgramData%\monBlock\logs).' }

$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline -and -not ([IO.Directory]::GetFiles('\\.\pipe\') -contains '\\.\pipe\monblockd')) { Start-Sleep -Milliseconds 500 }
$pipe = [IO.Directory]::GetFiles('\\.\pipe\') -contains '\\.\pipe\monblockd'
Write-Host "monblockd instalado: servico Running, pipe $(if ($pipe) { 'aberto' } else { 'AUSENTE' })."
