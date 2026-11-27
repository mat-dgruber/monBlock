# Utilitários do spike S0. Cada premissa grava results\<id>.json com status e evidência.
$ErrorActionPreference = 'Continue'
$SpikeRoot = 'C:\spike'
$ResultsDir = Join-Path $PSScriptRoot 'results'
New-Item -ItemType Directory -Force -Path $SpikeRoot, $ResultsDir | Out-Null

function Save-Result {
  param([string]$Id, [ValidateSet('PASSOU', 'FALHOU', 'NAO_TESTADO', 'ERRO')][string]$Status, [System.Collections.IDictionary]$Evidence)
  $obj = [ordered]@{ id = $Id; status = $Status; at = (Get-Date).ToString('o'); evidence = $Evidence }
  $obj | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $ResultsDir "$Id.json")
  Write-Host "[$Id] $Status"
}

# Executa um comando nativo e devolve código + saída combinada, sem lançar.
function Invoke-Native {
  param([string]$File, [string[]]$Arguments)
  $out = & $File @Arguments 2>&1 | Out-String
  return @{ cmd = "$File $($Arguments -join ' ')"; exit = $LASTEXITCODE; output = $out.Trim() }
}

function Write-TextFile {
  param([string]$Path, [string]$Text, [ValidateSet('utf8', 'utf8bom', 'utf16bom')][string]$Encoding = 'utf8')
  $crlf = $Text -replace "`r?`n", "`r`n"
  $enc = switch ($Encoding) {
    'utf8' { [Text.UTF8Encoding]::new($false) }
    'utf8bom' { [Text.UTF8Encoding]::new($true) }
    'utf16bom' { [Text.UnicodeEncoding]::new($false, $true) }
  }
  [IO.File]::WriteAllText($Path, $crlf, $enc)
}

# Usuário comum descartável para testar acesso sem privilégio (P4, P5).
function Get-SpikeCredential {
  $pwFile = Join-Path $SpikeRoot 'spike.pw'
  if (-not (Test-Path $pwFile)) {
    $pw = 'Sp1!' + [guid]::NewGuid().ToString('N')
    net user spike $pw /add /y | Out-Null
    Set-Content -Path $pwFile -Value $pw
    icacls $pwFile /inheritance:r /grant:r '*S-1-5-32-544:(F)' | Out-Null
  }
  $secure = ConvertTo-SecureString (Get-Content $pwFile) -AsPlainText -Force
  return [pscredential]::new("$env:COMPUTERNAME\spike", $secure)
}

# Roda um comando como o usuário `spike` e espera terminar.
function Invoke-AsSpike {
  param([string]$File, [string[]]$Arguments, [int]$TimeoutSec = 60)
  $cred = Get-SpikeCredential
  # Start-Process -Credential herda o ambiente do chamador: TEMP precisa ser gravável pelo `spike`.
  $tmp = Join-Path $SpikeRoot 'out\tmp'
  New-Item -ItemType Directory -Force $tmp | Out-Null
  icacls $tmp /grant '*S-1-5-32-545:(OI)(CI)(M)' | Out-Null
  $oldTemp, $oldTmp = $env:TEMP, $env:TMP
  $env:TEMP = $tmp; $env:TMP = $tmp
  try {
    $p = Start-Process -FilePath $File -ArgumentList $Arguments -Credential $cred -WorkingDirectory $SpikeRoot `
      -WindowStyle Hidden -PassThru -ErrorAction Stop
    if (-not $p.WaitForExit($TimeoutSec * 1000)) { $p.Kill(); return @{ ok = $false; error = 'timeout' } }
    return @{ ok = $true; exit = $p.ExitCode }
  } catch {
    return @{ ok = $false; error = $_.Exception.Message }
  } finally {
    $env:TEMP = $oldTemp; $env:TMP = $oldTmp
  }
}
