# P4b: aplica DACL explícita num pipe já criado, só a seção DACL (sem tocar owner/group).
# Roda como SYSTEM (dono do pipe). SDDL: SYSTEM e Admins tudo; Interactive Users leitura+escrita; NETWORK negado.
param([string]$PipeName, [string]$Sddl = 'D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)(D;;GA;;;NU)', [string]$OutFile)
$src = @'
using System;
using System.Runtime.InteropServices;
public static class Dacl {
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl, uint rev, out IntPtr sd, out uint size);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern bool GetSecurityDescriptorDacl(IntPtr sd, out bool present, out IntPtr dacl, out bool defaulted);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern uint SetSecurityInfo(IntPtr handle, int objectType, uint info, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sa, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
'@
$r = [ordered]@{ pipe = $PipeName; sddl = $Sddl }
try {
  Add-Type -TypeDefinition $src
  # READ_CONTROL | WRITE_DAC | GENERIC_READ ; OPEN_EXISTING
  $h = [Dacl]::CreateFile("\\.\pipe\$PipeName", 0x00020000 -bor 0x00040000 -bor 0x80000000, 3, [IntPtr]::Zero, 3, 0, [IntPtr]::Zero)
  if ($h -eq [IntPtr]::new(-1)) { throw "CreateFile falhou: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
  $sd = [IntPtr]::Zero; $size = 0
  if (-not [Dacl]::ConvertStringSecurityDescriptorToSecurityDescriptor($Sddl, 1, [ref]$sd, [ref]$size)) { throw "SDDL inválida: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
  $present = $false; $dacl = [IntPtr]::Zero; $def = $false
  [void][Dacl]::GetSecurityDescriptorDacl($sd, [ref]$present, [ref]$dacl, [ref]$def)
  # SE_KERNEL_OBJECT = 6 ; DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION
  $rc = [Dacl]::SetSecurityInfo($h, 6, [uint32]0x80000004, [IntPtr]::Zero, [IntPtr]::Zero, $dacl, [IntPtr]::Zero)
  [void][Dacl]::CloseHandle($h)
  $r.setSecurityInfo = $rc
  $r.ok = $rc -eq 0
} catch {
  $r.ok = $false
  $r.error = $_.Exception.Message
}
$r | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 $OutFile
if (-not $r.ok) { exit 1 }
