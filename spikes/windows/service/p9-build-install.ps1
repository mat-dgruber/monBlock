# P9: SEA em PE via postject roda como SYSTEM sob WinSW; whoami mostra S-1-16-16384.
param([string]$WinSWVersion = 'v2.12.0', [string]$WinSWSha256 = $env:WINSW_SHA256)
. "$PSScriptRoot\..\common.ps1"
$svcDir = Join-Path $SpikeRoot 'svc'
New-Item -ItemType Directory -Force $svcDir | Out-Null
$ev = [ordered]@{}
try {
  Push-Location $PSScriptRoot
  $ev.node = (node -v)
  $ev.seaConfig = Invoke-Native 'node' @('--experimental-sea-config', 'sea-config.json')
  $exe = Join-Path $svcDir 'monblockd-spike.exe'
  Copy-Item (Get-Command node).Source $exe -Force
  $signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object FullName -match '\\x64\\' | Select-Object -First 1
  if ($signtool) { $ev.signtool = Invoke-Native $signtool.FullName @('remove', '/s', $exe) } else { $ev.signtool = 'ausente' }
  $ev.postject = Invoke-Native 'npx.cmd' @('--yes', 'postject@1.0.0-alpha.6', $exe, 'NODE_SEA_BLOB', 'sea-prep.blob',
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2')
  $ev.selftest = Invoke-Native $exe @('--selftest')
  Pop-Location

  # WinSW: versão fixada; hash verificado se informado, senão registrado para fixar na F3.
  $winsw = Join-Path $svcDir 'monblockd-spike-service.exe'
  Invoke-WebRequest "https://github.com/winsw/winsw/releases/download/$WinSWVersion/WinSW-x64.exe" -OutFile $winsw -UseBasicParsing
  $ev.winswSha256 = (Get-FileHash $winsw -Algorithm SHA256).Hash.ToLower()
  if ($WinSWSha256 -and $ev.winswSha256 -ne $WinSWSha256.ToLower()) { throw "SHA-256 do WinSW divergente: $($ev.winswSha256)" }
  Copy-Item (Join-Path $PSScriptRoot 'monblockd-spike-service.xml') $svcDir -Force
  Copy-Item (Join-Path $PSScriptRoot 'task.ps1'), (Join-Path $PSScriptRoot 'detached.ps1'), (Join-Path $PSScriptRoot '..\pipe\apply-dacl.ps1') $SpikeRoot -Force
  New-Item -ItemType Directory -Force (Join-Path $SpikeRoot 'out') | Out-Null

  $ev.install = Invoke-Native $winsw @('install')
  $ev.start = Invoke-Native $winsw @('start')
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline -and -not (Test-Path "$SpikeRoot\whoami.txt")) { Start-Sleep 1 }
  $ev.service = (Get-Service monblockd-spike -ErrorAction SilentlyContinue | Select-Object Status, StartType)
  $ev.events = if (Test-Path "$SpikeRoot\events.log") { Get-Content "$SpikeRoot\events.log" -Raw } else { '' }
  $who = if (Test-Path "$SpikeRoot\whoami.txt") { Get-Content "$SpikeRoot\whoami.txt" -Raw } else { '' }
  $ev.whoamiHasSystemIntegrity = $who -match 'S-1-16-16384'
  $ev.whoamiHasHighIntegrity = $who -match 'S-1-16-12288'
  $ev.whoami = $who
  $ok = $ev.selftest.exit -eq 0 -and "$($ev.service.Status)" -eq 'Running' -and $ev.whoamiHasSystemIntegrity
  Save-Result 'P9' ($(if ($ok) { 'PASSOU' } else { 'FALHOU' })) $ev
} catch {
  $ev.error = $_.Exception.Message
  Save-Result 'P9' 'ERRO' $ev
}
