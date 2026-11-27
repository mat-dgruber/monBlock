# P5: roda como `spike`. Descobre o PID do servidor do pipe e se ele é filho do serviço monblockd-spike.
param([string]$PipeName, [string]$OutFile)
$sig = @'
using System;
using System.Runtime.InteropServices;
public static class PipeInfo {
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetNamedPipeServerProcessId(IntPtr pipe, out uint serverProcessId);
}
'@
$r = [ordered]@{ pipe = $PipeName; user = $env:USERNAME }
try {
  Add-Type -TypeDefinition $sig
  $c = [System.IO.Pipes.NamedPipeClientStream]::new('.', $PipeName, [System.IO.Pipes.PipeDirection]::InOut)
  $c.Connect(3000)
  [uint32]$serverPid = 0
  $r.apiOk = [PipeInfo]::GetNamedPipeServerProcessId($c.SafePipeHandle.DangerousGetHandle(), [ref]$serverPid)
  $r.lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  $r.serverPid = $serverPid
  $c.Dispose()
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid" -ErrorAction SilentlyContinue
  $r.serverParentPid = $proc.ParentProcessId
  $r.serverImage = $proc.ExecutablePath
  $svc = Get-CimInstance Win32_Service -Filter "Name='monblockd-spike'" -ErrorAction SilentlyContinue
  $r.servicePid = $svc.ProcessId
  $r.isServiceChild = ($svc.ProcessId -gt 0) -and ($proc.ParentProcessId -eq $svc.ProcessId)
  try { $r.ownerQuery = (Invoke-CimMethod -InputObject $proc -MethodName GetOwner | Select-Object Domain, User, ReturnValue) } catch { $r.ownerQuery = $_.Exception.Message }
} catch {
  $r.error = $_.Exception.Message
}
$r | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $OutFile
