# Empacota o app Electron para win32-x64 em build\windows-app\monBlock-win32-x64 (W3, ADR-0016 D3).
# O app nao tem dependencias de runtime: so dist\ e package.json entram (asar).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build falhou' }
  $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
  $ignore = '^/(src|tests|docs|scripts|packaging|build|spikes|mods|_reversa_sdd|\.claude|\.agents|\.github|\.gemini|\.reversa|\.cache|node_modules)($|/)'
  npx electron-packager . monBlock --platform=win32 --arch=x64 --out=build/windows-app --overwrite --asar `
    --icon=packaging/windows/monblock.ico --app-version=$version --app-copyright="CCAT" `
    --win32metadata.CompanyName="CCAT" --win32metadata.FileDescription="monBlock" `
    --win32metadata.ProductName="monBlock" --ignore="$ignore"
  if ($LASTEXITCODE -ne 0) { throw 'electron-packager falhou' }
  $exe = Join-Path $root 'build\windows-app\monBlock-win32-x64\monBlock.exe'
  if (-not (Test-Path $exe)) { throw "monBlock.exe nao gerado: $exe" }
  Write-Host "ok: $exe"
} finally {
  Pop-Location
}
