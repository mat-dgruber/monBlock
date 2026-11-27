<#
.SYNOPSIS
    Desinstalacao autorizada do monBlock no Windows (W12, ADR-0016 D4).
.DESCRIPTION
    Roda como SYSTEM pela tarefa agendada "monBlock\Uninstall", que o daemon cria depois do
    UNINSTALL_AUTHORIZED validado pelo Ajudante. Idempotente: se cair no meio, a tarefa (onstart) roda de
    novo no proximo boot; a tarefa so e apagada quando tudo terminou. Log em %ProgramData%\monBlock-uninstall.log
    (fora do DATA_DIR, que e apagado).
#>
$ErrorActionPreference = 'Continue'
$installDir = Join-Path $env:ProgramFiles 'monBlock'
$dataDir = Join-Path $env:ProgramData 'monBlock'
$log = Join-Path $env:ProgramData 'monBlock-uninstall.log'
function Write-Log([string]$m) { "$(Get-Date -Format o) $m" | Add-Content -Path $log -Encoding utf8 }
Write-Log 'inicio'
Start-Sleep -Seconds 3 # deixa a resposta 200 do UNINSTALL_AUTHORIZED sair pelo pipe

# 1. Servico (WinSW) e processos.
$winsw = Join-Path $installDir 'monblockd-service.exe'
if (Get-Service monblockd -ErrorAction SilentlyContinue) {
  if (Test-Path $winsw) { & $winsw stop | Out-Null; & $winsw uninstall | Out-Null } else { sc.exe stop monblockd | Out-Null; sc.exe delete monblockd | Out-Null }
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline -and (Get-Service monblockd -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 500 }
}
Get-Process monblockd, monBlock -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Log ('servico: ' + $(if (Get-Service monblockd -ErrorAction SilentlyContinue) { 'AINDA EXISTE' } else { 'removido' }))

# 2. Hosts: backup da instalacao com hash, com novas tentativas (o antivirus trava o arquivo apos escritas).
$hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$backup = Join-Path $dataDir 'hosts.install.bak'
$hostsOk = $true
if (Test-Path $backup) {
  $want = Get-Content "$backup.sha256" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $want) { $want = (Get-FileHash $backup -Algorithm SHA256).Hash }
  icacls $hosts /reset | Out-Null
  $hostsOk = $false
  foreach ($wait in 0, 200, 500, 1000, 2000, 4000) {
    Start-Sleep -Milliseconds $wait
    try { [IO.File]::Copy($backup, $hosts, $true); if ((Get-FileHash $hosts -Algorithm SHA256).Hash -eq $want) { $hostsOk = $true; break } } catch { }
  }
} else {
  # Sem backup: tira so o bloco gerenciado.
  try {
    $content = [IO.File]::ReadAllText($hosts)
    $clean = [regex]::Replace($content, '(?s)# >>> MONBLOCK START >>>.*?# <<< MONBLOCK END <<<\r?\n?', '')
    [IO.File]::WriteAllText($hosts, $clean)
  } catch { $hostsOk = $false }
}
icacls $hosts /reset | Out-Null
Remove-Item (Join-Path $env:SystemRoot 'System32\drivers\etc\hosts.monblock.*') -Force -ErrorAction SilentlyContinue
ipconfig /flushdns | Out-Null
Write-Log "hosts: $(if ($hostsOk) { 'restaurado' } else { 'FALHOU' })"

# 3. Politicas gerenciadas (as chaves raiz ficam; podem ter politicas de outra origem).
foreach ($k in 'Google\Chrome', 'Microsoft\Edge', 'BraveSoftware\Brave', 'Chromium', 'Vivaldi') {
  $key = "HKLM\SOFTWARE\Policies\$k"
  foreach ($sub in 'URLBlocklist', 'URLAllowlist') { reg delete "$key\$sub" /f 2>&1 | Out-Null }
  foreach ($v in 'DnsOverHttpsMode', 'IncognitoModeAvailability', 'InPrivateModeAvailability') { reg delete $key /v $v /f 2>&1 | Out-Null }
}
$ff = 'HKLM\SOFTWARE\Policies\Mozilla\Firefox'
foreach ($sub in 'WebsiteFilter', 'DNSOverHTTPS') { reg delete "$ff\$sub" /f 2>&1 | Out-Null }
reg delete $ff /v DisablePrivateBrowsing /f 2>&1 | Out-Null

# 4. Atalhos (Menu Iniciar e inicializacao) e pastas.
foreach ($lnk in "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\monBlock.lnk", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\monBlock.lnk") {
  Remove-Item $lnk -Force -ErrorAction SilentlyContinue
}
Remove-Item $installDir, $dataDir -Recurse -Force -ErrorAction SilentlyContinue
$foldersOk = -not ((Test-Path $installDir) -or (Test-Path $dataDir))
Write-Log "pastas: $(if ($foldersOk) { 'removidas' } else { 'SOBROU' })"

# 5. So apaga a tarefa se tudo deu certo; senao ela roda de novo no proximo boot.
if ($hostsOk -and $foldersOk -and -not (Get-Service monblockd -ErrorAction SilentlyContinue)) {
  schtasks.exe /delete /tn 'monBlock\Uninstall' /f | Out-Null
  Write-Log 'concluido'
} else {
  Write-Log 'incompleto: a tarefa fica para o proximo boot'
}
