# P7: shell.openExternal preserva & e , ; explorer.exe sai com código 1; cmd /c start quebra a URL.
. "$PSScriptRoot\..\common.ps1"
$out = Join-Path $SpikeRoot 'out\p7.json'
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
$repo = Resolve-Path "$PSScriptRoot\..\..\.."
try {
  $electron = Join-Path $repo 'node_modules\electron\dist\electron.exe'
  $p = Start-Process -FilePath $electron -ArgumentList "`"$PSScriptRoot\open-url.cjs`"", "`"$out`"" -PassThru
  if (-not $p.WaitForExit(120000)) { $p.Kill() }
  $r = Get-Content $out -Raw -ErrorAction Stop | ConvertFrom-Json
  $st = if ($r.openExternal.intact -eq $true) { 'PASSOU' } elseif ($null -eq $r.openExternal.received) { 'NAO_TESTADO' } else { 'FALHOU' }
  Save-Result 'P7' $st @{ report = $r; note = 'NAO_TESTADO = nenhum navegador abriu a URL no runner; repetir no E2.' }
} catch {
  Save-Result 'P7' 'ERRO' @{ error = $_.Exception.Message }
} finally {
  Get-Process msedge, chrome -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
