# pipe-acl (W4, ADR-0016 D2-A). Executado pelo monblockd (SYSTEM, dono do pipe) logo após o listen.
# Troca só a DACL do pipe: SYSTEM e Administradores tudo; usuários interativos leitura+escrita; logon de rede negado.
# Não usar PipeSecurity.SetAccessControl do .NET: ele tenta regravar owner/group e falha mesmo como SYSTEM (S0, P4).
# Saída: uma linha JSON. Sucesso SÓ com {"ok":true}; em CLM o PowerShell sai 0 sem imprimir nada (S0-E2, P8).
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9._-]{1,64}$')][string]$PipeName,
  [string]$Sddl = 'D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)(D;;GA;;;NU)'
)
$ErrorActionPreference = 'Stop'
$src = @'
using System;
using System.Runtime.InteropServices;
public static class MonBlockPipeDacl {
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl, uint rev, out IntPtr sd, out uint size);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern bool GetSecurityDescriptorDacl(IntPtr sd, out bool present, out IntPtr dacl, out bool defaulted);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern uint SetSecurityInfo(IntPtr handle, int objectType, uint info, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sa, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] public static extern IntPtr LocalFree(IntPtr h);
}
'@
function Out-Result([hashtable]$r) { [Console]::Out.WriteLine(($r | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
try {
  Add-Type -TypeDefinition $src
  # READ_CONTROL | WRITE_DAC | GENERIC_READ ; OPEN_EXISTING. [uint32] evita estouro do inteiro com sinal (S0).
  [uint32]$access = [uint32]'0x80060000'
  $h = [MonBlockPipeDacl]::CreateFile("\\.\pipe\$PipeName", $access, 3, [IntPtr]::Zero, 3, 0, [IntPtr]::Zero)
  if ($h -eq [IntPtr]::new(-1)) { throw "CreateFile: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
  try {
    $sd = [IntPtr]::Zero; $size = [uint32]0
    if (-not [MonBlockPipeDacl]::ConvertStringSecurityDescriptorToSecurityDescriptor($Sddl, 1, [ref]$sd, [ref]$size)) {
      throw "SDDL: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
    $present = $false; $dacl = [IntPtr]::Zero; $def = $false
    [void][MonBlockPipeDacl]::GetSecurityDescriptorDacl($sd, [ref]$present, [ref]$dacl, [ref]$def)
    # SE_KERNEL_OBJECT = 6 ; DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION
    $rc = [MonBlockPipeDacl]::SetSecurityInfo($h, 6, [uint32]'0x80000004', [IntPtr]::Zero, [IntPtr]::Zero, $dacl, [IntPtr]::Zero)
    [void][MonBlockPipeDacl]::LocalFree($sd)
    if ($rc -ne 0) { throw "SetSecurityInfo: $rc" }
  } finally {
    [void][MonBlockPipeDacl]::CloseHandle($h)
  }
  Out-Result @{ ok = $true }
  exit 0
} catch {
  Out-Result @{ ok = $false; error = $_.Exception.Message }
  exit 1
}
