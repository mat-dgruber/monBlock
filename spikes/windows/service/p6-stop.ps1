# P6: Ctrl+C chega como sinal; WinSW mata a árvore; tarefa agendada / spawn desacoplado sobrevivem.
# Depois testa squatting: usuário comum ocupa o pipe com o serviço parado e o serviço tenta subir.
. "$PSScriptRoot\..\common.ps1"
$winsw = Join-Path $SpikeRoot 'svc\monblockd-spike-service.exe'
$ev = [ordered]@{}
try {
  $childPid = [int](Get-Content "$SpikeRoot\child.pid")
  $ev.childAliveBefore = [bool](Get-Process -Id $childPid -ErrorAction SilentlyContinue)
  $t0 = Get-Date
  $ev.stop = Invoke-Native $winsw @('stop')
  $ev.stopSeconds = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
  Start-Sleep -Seconds 3
  $ev.childAliveAfter = [bool](Get-Process -Id $childPid -ErrorAction SilentlyContinue)
  Start-Sleep -Seconds 30
  $events = Get-Content "$SpikeRoot\events.log" -Raw
  $ev.signalLogged = [regex]::Match($events, 'signal (\w+)').Groups[1].Value
  $ev.cleanExitLogged = $events -match 'clean exit'
  $ev.taskSurvived = Test-Path "$SpikeRoot\task-done.txt"
  $ev.detachedSurvived = Test-Path "$SpikeRoot\detached-done.txt"
  $ev.taskInfo = Invoke-Native 'schtasks.exe' @('/query', '/tn', 'MonBlockSpikeTask', '/v', '/fo', 'list')

  # Squatting: `spike` cria o pipe com o serviço parado; o serviço sobe e deveria acusar EADDRINUSE.
  $cred = Get-SpikeCredential
  $squat = Start-Process -FilePath (Get-Command node).Source -ArgumentList "$SpikeRoot\pipe\impostor.mjs", 'monblockd-spike' `
    -Credential $cred -WorkingDirectory $SpikeRoot -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 3
  $ev.squatterRunning = -not $squat.HasExited
  $ev.restart = Invoke-Native $winsw @('start')
  Start-Sleep -Seconds 5
  $ev.eventsAfterSquat = (Get-Content "$SpikeRoot\events.log" | Select-Object -Last 8) -join "`n"
  $ev.squatDetected = $ev.eventsAfterSquat -match 'listen error monblockd-spike EADDRINUSE'
  if (-not $squat.HasExited) { Stop-Process -Id $squat.Id -Force }

  $ok = $ev.signalLogged -and $ev.cleanExitLogged -and -not $ev.childAliveAfter -and $ev.taskSurvived
  Save-Result 'P6' ($(if ($ok) { 'PASSOU' } else { 'FALHOU' })) $ev
} catch {
  $ev.error = $_.Exception.Message
  Save-Result 'P6' 'ERRO' $ev
} finally {
  & $winsw stop 2>&1 | Out-Null
  & $winsw uninstall 2>&1 | Out-Null
  schtasks.exe /delete /tn MonBlockSpikeTask /f 2>&1 | Out-Null
}
