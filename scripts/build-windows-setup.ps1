<#
.SYNOPSIS
    Gera instalador Windows do monBlock via Inno Setup ou zip de distribuição.
#>

param (
    [string]$Version = (Get-Content "package.json" | ConvertFrom-Json).version
)

$OutputDir = "build\windows-dist"
$DistDir = "$OutputDir\monBlock-$Version"

Write-Host "Preparando build de distribuição Windows para monBlock v$Version..."

Remove-Item -Path $OutputDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$DistDir\service", "$DistDir\app", "$DistDir\design" -Force | Out-Null

# Copia arquivos estáticos de design
Copy-Item "docs\design\blocked-page.html", "docs\design\tokens.css" -Destination "$DistDir\design"

# Copia script de serviço
Copy-Item "scripts\windows\install-service.ps1" -Destination "$DistDir\service"

Write-Host "Estrutura pronta em $DistDir."
Write-Host "Para gerar instalador executável, execute ISCC.exe (Inno Setup Compiler) com o script de setup."
