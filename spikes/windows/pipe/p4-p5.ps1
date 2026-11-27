# P4: readableAll/writableAll dá escrita ao usuário comum em todas as instâncias; DACL padrão não; rede negada.
# P5: o usuário comum distingue o servidor legítimo (filho do serviço) de um impostor.
. "$PSScriptRoot\..\common.ps1"
$pipeDir = Join-Path $SpikeRoot 'pipe'
$outDir = Join-Path $SpikeRoot 'out'
New-Item -ItemType Directory -Force $pipeDir, $outDir | Out-Null
Copy-Item "$PSScriptRoot\*.mjs", "$PSScriptRoot\owner-probe.ps1" $pipeDir -Force
icacls $pipeDir /grant '*S-1-5-32-545:(OI)(CI)(RX)' | Out-Null
icacls $outDir /grant '*S-1-5-32-545:(OI)(CI)(M)' | Out-Null
$node = (Get-Command node).Source
$ev = [ordered]@{ lanmanServer = (Get-Service LanmanServer -ErrorAction SilentlyContinue).Status; nodeAcl = (icacls $node | Out-String).Trim() }

try {
  $ev.runClient = Invoke-AsSpike $node @("$pipeDir\client.mjs", "$outDir\p4-client.json", '10')
  $c = Get-Content "$outDir\p4-client.json" -Raw -ErrorAction Stop | ConvertFrom-Json
  $ev.client = $c
  $writeAllOk = $c.readableWritableAll.okCount -eq 10
  $defaultBlocked = $c.defaultDacl.okCount -eq 0
  $remoteDenied = ($c.remoteLocalhost.okCount -eq 0) -and ($c.remoteComputerName.okCount -eq 0)
  $ev.summary = @{ writeAllOk = $writeAllOk; defaultBlocked = $defaultBlocked; remoteDenied = $remoteDenied }
  $p4 = if ($writeAllOk -and $remoteDenied) { 'PASSOU' } else { 'FALHOU' }
  Save-Result 'P4' $p4 $ev
} catch {
  $ev.error = $_.Exception.Message
  Save-Result 'P4' 'ERRO' $ev
}

$ev5 = [ordered]@{}
try {
  $ev5.legitRun = Invoke-AsSpike 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$pipeDir\owner-probe.ps1", 'monblockd-spike', "$outDir\p5-legit.json")
  $ev5.legit = Get-Content "$outDir\p5-legit.json" -Raw | ConvertFrom-Json
  $cred = Get-SpikeCredential
  $imp = Start-Process -FilePath $node -ArgumentList "$pipeDir\impostor.mjs", 'monblockd-impostor' -Credential $cred -WorkingDirectory $SpikeRoot -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 3
  $ev5.impostorRun = Invoke-AsSpike 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$pipeDir\owner-probe.ps1", 'monblockd-impostor', "$outDir\p5-impostor.json")
  $ev5.impostor = Get-Content "$outDir\p5-impostor.json" -Raw | ConvertFrom-Json
  if (-not $imp.HasExited) { Stop-Process -Id $imp.Id -Force }
  $ok = $ev5.legit.isServiceChild -eq $true -and $ev5.impostor.isServiceChild -eq $false -and $ev5.impostor.serverPid -gt 0
  Save-Result 'P5' ($(if ($ok) { 'PASSOU' } else { 'FALHOU' })) $ev5
} catch {
  $ev5.error = $_.Exception.Message
  Save-Result 'P5' 'ERRO' $ev5
}
