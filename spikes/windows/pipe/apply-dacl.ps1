# P4b: aplica DACL explícita num pipe já criado (roda com WRITE_DAC: SYSTEM/admin). Windows PowerShell 5.1 (.NET Framework).
# SDDL: SYSTEM e Admins tudo; Interactive Users leitura+escrita; NETWORK negado.
param([string]$PipeName, [string]$Sddl = 'D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)(D;;GA;;;NU)', [string]$OutFile)
$r = [ordered]@{ pipe = $PipeName; sddl = $Sddl }
try {
  $rights = [System.IO.Pipes.PipeAccessRights]::ReadWrite -bor [System.IO.Pipes.PipeAccessRights]::ChangePermissions -bor [System.IO.Pipes.PipeAccessRights]::ReadPermissions
  $c = New-Object System.IO.Pipes.NamedPipeClientStream('.', $PipeName, $rights, [System.IO.Pipes.PipeOptions]::None,
    [System.Security.Principal.TokenImpersonationLevel]::None, [System.IO.HandleInheritability]::None)
  $c.Connect(3000)
  $sec = New-Object System.IO.Pipes.PipeSecurity
  $sec.SetSecurityDescriptorSddlForm($Sddl)
  $c.SetAccessControl($sec)
  $r.after = $c.GetAccessControl().GetSecurityDescriptorSddlForm('Access')
  $c.Dispose()
  $r.ok = $true
} catch {
  $r.ok = $false
  $r.error = $_.Exception.Message
}
$r | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 $OutFile
if (-not $r.ok) { exit 1 }
