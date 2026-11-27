# P10: o Defender reage a um hosts com as listas atuais (~8,6 k domínios)?
param([int]$WaitSec = 300)
. "$PSScriptRoot\..\common.ps1"
$hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$backup = Join-Path $SpikeRoot 'hosts.monblock-spike.bak'
try {
  $status = Get-MpComputerStatus | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, AMProductVersion
  $lists = Get-ChildItem (Join-Path $PSScriptRoot '..\..\..\src\domain\lists') -Filter '*.domains.txt'
  $domains = $lists | ForEach-Object { Get-Content $_.FullName } |
    ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ -and -not $_.StartsWith('#') } | Sort-Object -Unique
  Copy-Item $hosts $backup -Force
  $before = Get-MpThreatDetection | Measure-Object | Select-Object -ExpandProperty Count
  $block = @('# >>> MONBLOCK START >>>') + ($domains | ForEach-Object { "0.0.0.0 $_"; "0.0.0.0 www.$_" }) + @('# <<< MONBLOCK END <<<')
  Add-Content -Path $hosts -Value ("`r`n" + ($block -join "`r`n")) -Encoding ascii
  Start-Sleep -Seconds $WaitSec
  $after = Get-MpThreatDetection
  $stillThere = (Get-Content $hosts -Raw) -match 'MONBLOCK START'
  $newDetections = @($after | Select-Object -Skip $before | Select-Object ThreatID, ProcessName, Resources, InitialDetectionTime)
  $st = if (-not $status.RealTimeProtectionEnabled) { 'NAO_TESTADO' } elseif ($stillThere -and $newDetections.Count -eq 0) { 'PASSOU' } else { 'FALHOU' }
  Save-Result 'P10' $st @{ defender = $status; domainCount = $domains.Count; hostsLines = $block.Count; waitedSec = $WaitSec; stillThere = $stillThere; newDetections = $newDetections }
} catch {
  Save-Result 'P10' 'ERRO' @{ error = $_.Exception.Message }
} finally {
  if (Test-Path $backup) { Copy-Item $backup $hosts -Force }
}
