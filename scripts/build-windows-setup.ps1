<#
.SYNOPSIS
    Gera build\windows-setup\monBlock-Setup-<versao>.exe e o .sha256 (W3, ADR-0016 D3).
.DESCRIPTION
    1. monblockd.exe (SEA) + WinSW + helpers (scripts\build-daemon-sea.ps1)
    2. app Electron empacotado (scripts\build-app-win.ps1)
    3. instalador Inno Setup 6 (packaging\windows\monblock.iss)
    O ISCC vem de $env:INNO_ISCC ou das pastas padrao (por maquina ou por usuario).
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
  & (Join-Path $PSScriptRoot 'build-daemon-sea.ps1')
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'build do daemon falhou' }
  & (Join-Path $PSScriptRoot 'build-app-win.ps1')

  $iscc = @($env:INNO_ISCC,
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $iscc) { throw 'ISCC.exe (Inno Setup 6) nao encontrado; defina INNO_ISCC.' }

  $out = Join-Path $root 'build\windows-setup'
  Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $out | Out-Null
  & $iscc /Q "/DAppVersion=$version" "/DDaemonDir=$root\build\windows" "/DAppDir=$root\build\windows-app\monBlock-win32-x64" "/DOutputDir=$out" (Join-Path $root 'packaging\windows\monblock.iss')
  if ($LASTEXITCODE -ne 0) { throw "ISCC falhou ($LASTEXITCODE)" }

  $setup = Join-Path $out "monBlock-Setup-$version.exe"
  $hash = (Get-FileHash $setup -Algorithm SHA256).Hash.ToLower()
  "$hash  monBlock-Setup-$version.exe" | Set-Content -Encoding ascii "$setup.sha256"
  Write-Host "ok: $setup"
  Write-Host "sha256: $hash"
} finally {
  Pop-Location
}
