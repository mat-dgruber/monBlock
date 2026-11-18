<#
.SYNOPSIS
    Instala e inicia o serviço Windows monblockd como NT AUTHORITY\SYSTEM.
.DESCRIPTION
    Script PowerShell de provisionamento do monBlock Daemon como Windows Service nativo.
#>

[CmdletBinding()]
param (
    [string]$BinPath = "$PSScriptRoot\monblockd.exe"
)

$ServiceName = "monblockd"
$DisplayName = "monBlock Protection Daemon"

Write-Host "Verificando privilégios de Administrador..."
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Este script precisa ser executado como Administrador."
    exit 1
}

if (-not (Test-Path $BinPath)) {
    Write-Error "Binário do daemon não encontrado em: $BinPath"
    exit 1
}

Write-Host "Registrando serviço $ServiceName..."
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Serviço já existente. Parando e removendo para atualização..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

# Cria o serviço configurado para inicialização automática como SYSTEM
sc.exe create $ServiceName binPath= "`"$BinPath`"" start= auto DisplayName= "$DisplayName" | Out-Null

# Configura política de recuperação Fail-Closed: reinicia em 5s se falhar
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null

# Cria diretórios de dados em %ProgramData%
$dataDir = "$env:ProgramData\monBlock"
$dbDir = "$dataDir\db"
$runDir = "$dataDir\run"
New-Item -ItemType Directory -Path $dataDir, $dbDir, $runDir -Force | Out-Null

# Restringe ACLs da pasta de dados para Administradores e SYSTEM
icacls "$dataDir" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)(F)" "*S-1-5-32-544:(OI)(CI)(F)" | Out-Null

Write-Host "Iniciando $ServiceName..."
Start-Service -Name $ServiceName
Write-Host "monBlock Daemon instalado e ativo com sucesso."
