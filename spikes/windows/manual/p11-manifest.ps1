# P11 (E2, admin): importa políticas reais com HKEY_LOCAL_MACHINE para Chrome/Edge/Brave/Chromium/Vivaldi/Firefox
# bloqueando só example.com. Use -Cleanup para remover as subchaves gerenciadas depois.
param([switch]$Cleanup)
$chromium = 'Google\Chrome', 'Microsoft\Edge', 'BraveSoftware\Brave', 'Chromium', 'Vivaldi'
$root = 'HKEY_LOCAL_MACHINE\SOFTWARE\Policies'
if ($Cleanup) {
  foreach ($k in $chromium) { reg delete "HKLM\SOFTWARE\Policies\$k\URLBlocklist" /f; reg delete "HKLM\SOFTWARE\Policies\$k\URLAllowlist" /f }
  reg delete 'HKLM\SOFTWARE\Policies\Mozilla\Firefox\WebsiteFilter' /f
  exit
}
$lines = @('Windows Registry Editor Version 5.00', '')
foreach ($k in $chromium) {
  $lines += "[-$root\$k\URLBlocklist]", '', "[$root\$k\URLBlocklist]", '"1"="example.com"', ''
}
$lines += "[-$root\Mozilla\Firefox\WebsiteFilter]", '', "[$root\Mozilla\Firefox\WebsiteFilter\Block]", '"1"="*://*.example.com/*"', ''
$file = Join-Path $env:TEMP 'p11.reg'
[IO.File]::WriteAllText($file, ($lines -join "`r`n"), [Text.UTF8Encoding]::new($false))
reg import $file
Write-Host "Import exit: $LASTEXITCODE. Agora abra chrome://policy, edge://policy e about:policies, recarregue e tente https://example.com."
