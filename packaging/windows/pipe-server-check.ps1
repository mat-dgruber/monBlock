# pipe-server-check (W21, ADR-0016 D2.1). Roda como o usuário do app, sem elevação.
# Confere que quem serve o pipe é filho do serviço monblockd (o WinSW), e não um impostor (S0, P5).
# Um usuário comum não consegue ler o dono nem o caminho de um processo SYSTEM, por isso a prova é o PPID.
# Saída: uma linha JSON; verificado SÓ com "verified":true.
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._-]{1,64}$')][string]$PipeName,
  [ValidatePattern('^[A-Za-z0-9._-]{1,64}$')][string]$ServiceName = 'monblockd'
)
$ErrorActionPreference = 'Stop'
$sig = @'
using System;
using System.Runtime.InteropServices;
public static class MonBlockPipeInfo {
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetNamedPipeServerProcessId(IntPtr pipe, out uint serverProcessId);
}
'@
function Out-Result([hashtable]$r) { [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
function Get-Wmi([string]$query) {
  # System.Management direto: não depende do módulo CimCmdlets (PSModulePath do PowerShell 7 quebra o autoload).
  Add-Type -AssemblyName System.Management
  $s = [System.Management.ManagementObjectSearcher]::new($query)
  # Vírgula: sem ela o PowerShell desembrulha o array de 1 item e $r[0] indexa o ManagementObject (PID vira 0).
  try { return , @($s.Get()) } finally { $s.Dispose() }
}
try {
  Add-Type -TypeDefinition $sig
  $svc = Get-Wmi "SELECT ProcessId, State FROM Win32_Service WHERE Name = '$ServiceName'"
  $servicePid = if ($svc.Count -gt 0) { [uint32]$svc[0]['ProcessId'] } else { 0 }
  if ($servicePid -eq 0) { Out-Result @{ verified = $false; reason = 'service-not-running' }; exit 0 }

  $c = [System.IO.Pipes.NamedPipeClientStream]::new('.', $PipeName, [System.IO.Pipes.PipeDirection]::In)
  try {
    $c.Connect(3000)
    [uint32]$serverPid = 0
    if (-not [MonBlockPipeInfo]::GetNamedPipeServerProcessId($c.SafePipeHandle.DangerousGetHandle(), [ref]$serverPid)) {
      throw "GetNamedPipeServerProcessId: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
  } finally {
    $c.Dispose()
  }
  $proc = Get-Wmi "SELECT ParentProcessId FROM Win32_Process WHERE ProcessId = $serverPid"
  $parent = if ($proc.Count -gt 0) { [uint32]$proc[0]['ParentProcessId'] } else { 0 }
  Out-Result @{ verified = ($parent -eq $servicePid); serverPid = $serverPid; parentPid = $parent; servicePid = $servicePid }
  exit 0
} catch {
  Out-Result @{ verified = $false; reason = 'error'; error = $_.Exception.Message }
  exit 1
}
