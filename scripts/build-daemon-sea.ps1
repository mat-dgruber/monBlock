# Gera build\windows\: monblockd.exe (Node SEA), WinSW renomeado, XML do servico, helpers e pagina de bloqueio.
# Receita do spike S0 (P9): postject sem --macho-segment-name; o binario roda como SYSTEM sob o WinSW.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-daemon-sea.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'build\windows'
$work = Join-Path $root 'build\daemon-win'

# Versoes e hashes fixados (ADR-0016). WinSW: SHA-256 observado no CI do S0 e conferido de novo em outra
# maquina/rede em 2026-11-27 (a API do GitHub nao publica digest para esse asset).
$WinSWUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'
$WinSWSha256 = '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da'
$Postject = 'postject@1.0.0-alpha.6'
$SeaFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

Push-Location $root
try {
  Remove-Item $out, $work -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $out, $work, (Join-Path $out 'design') | Out-Null

  # 1. Bundle CJS unico (scripts\bundle-daemon.mjs, pela API do esbuild).
  node scripts\bundle-daemon.mjs "$work\monblockd.cjs"
  if ($LASTEXITCODE -ne 0) { throw 'esbuild falhou' }

  $seaConfig = @{ main = "$work\monblockd.cjs"; output = "$work\sea-prep.blob"; disableExperimentalSEAWarning = $true; useCodeCache = $false }
  $seaConfig | ConvertTo-Json | Set-Content -Encoding ascii "$work\sea-config.json"
  node --experimental-sea-config "$work\sea-config.json"
  if ($LASTEXITCODE -ne 0) { throw 'sea-config falhou' }

  # 2. Copia do node.exe + blob. A assinatura Authenticode do node.exe e removida se houver signtool (S0).
  $exe = Join-Path $out 'monblockd.exe'
  Copy-Item (Get-Command node).Source $exe -Force
  $signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object FullName -match '\\x64\\' | Select-Object -First 1
  if ($signtool) { & $signtool.FullName remove /s $exe | Out-Null }
  npx --yes $Postject $exe NODE_SEA_BLOB "$work\sea-prep.blob" --sentinel-fuse $SeaFuse
  if ($LASTEXITCODE -ne 0) { throw 'postject falhou' }

  # 3. WinSW com hash conferido; divergencia aborta.
  $winsw = Join-Path $out 'monblockd-service.exe'
  Invoke-WebRequest $WinSWUrl -OutFile $winsw -UseBasicParsing
  $got = (Get-FileHash $winsw -Algorithm SHA256).Hash.ToLower()
  if ($got -ne $WinSWSha256) { Remove-Item $winsw -Force; throw "SHA-256 do WinSW divergente: $got" }

  # 4. XML, helpers PowerShell e pagina de bloqueio.
  Copy-Item packaging\windows\monblockd-service.xml, packaging\windows\pipe-acl.ps1, packaging\windows\pipe-server-check.ps1 $out
  Copy-Item docs\design\blocked-page.html, docs\design\tokens.css (Join-Path $out 'design')

  # 5. Smoke: sem privilegio e sem MONBLOCK_DEV_ROOT_DIR o daemon tem de recusar subir (prova que o bundle roda).
  $env:MONBLOCK_DEV_ROOT_DIR = $null
  $ErrorActionPreference = 'Continue' # no PowerShell 5.1, stderr de nativo com 2>&1 vira erro terminante
  $smoke = & $exe 2>&1 | Out-String
  $ErrorActionPreference = 'Stop'
  if ($smoke -notmatch 'precisa rodar privilegiado') { throw "smoke do monblockd.exe falhou: $smoke" }

  Get-ChildItem $out -Recurse | Where-Object { -not $_.PSIsContainer } |
    ForEach-Object { '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.FullName.Substring($out.Length + 1) } |
    Set-Content -Encoding ascii (Join-Path $out 'SHA256SUMS.txt')
  Write-Host "ok: $out (node $(node -v))"
} finally {
  Pop-Location
}
