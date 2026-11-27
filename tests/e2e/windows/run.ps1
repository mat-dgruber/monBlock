<#
.SYNOPSIS
    E2E do pacote Windows (W18): instala o Setup, prova o servico como SYSTEM, o IPC com usuario comum,
    a anti-impostura (W21), a volta apos taskkill e a desinstalacao por tarefa agendada (W12) ate a
    maquina ficar limpa. Roda como administrador num runner descartavel (windows-latest), sem UAC.
.PARAMETER Setup
    Caminho do monBlock-Setup-<versao>.exe.
#>
param([Parameter(Mandatory = $true)][string]$Setup)
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$work = Join-Path $env:RUNNER_TEMP 'mb-e2e'
New-Item -ItemType Directory -Force $work | Out-Null
icacls $work /grant '*S-1-5-32-545:(OI)(CI)(M)' | Out-Null
$results = [ordered]@{}
$failures = [Collections.Generic.List[string]]::new()
function Check([string]$name, [bool]$ok, $detail = '') {
  $results[$name] = [ordered]@{ ok = $ok; detail = "$detail" }
  Write-Host ("[{0}] {1} {2}" -f $(if ($ok) { 'OK ' } else { 'FALHOU' }), $name, $detail)
  if (-not $ok) { $failures.Add($name) }
}
function PipeUp { [IO.Directory]::GetFiles('\\.\pipe\') -contains '\\.\pipe\monblockd' }
function WaitFor([scriptblock]$cond, [int]$sec) {
  $t = [Diagnostics.Stopwatch]::StartNew()
  while ($t.Elapsed.TotalSeconds -lt $sec) { if (& $cond) { return [math]::Round($t.Elapsed.TotalSeconds, 1) }; Start-Sleep -Milliseconds 250 }
  return $null
}
function DaemonPid {
  $svc = Get-CimInstance Win32_Service -Filter "Name='monblockd'"
  if (-not $svc -or -not $svc.ProcessId) { return $null }
  (Get-CimInstance Win32_Process -Filter "ParentProcessId=$($svc.ProcessId) AND Name='monblockd.exe'").ProcessId
}

# Usuario comum descartavel (senha aleatoria, nunca impressa) para os testes sem privilegio.
$pw = 'Mb1!' + [guid]::NewGuid().ToString('N')
net user mbe2e $pw /add /y | Out-Null
$cred = [pscredential]::new("$env:COMPUTERNAME\mbe2e", (ConvertTo-SecureString $pw -AsPlainText -Force))
$node = (Get-Command node).Source
function AsUser([string]$file, [string[]]$arguments, [int]$timeoutSec = 60, [switch]$NoWait) {
  $oldTemp, $oldTmp = $env:TEMP, $env:TMP
  $env:TEMP = $work; $env:TMP = $work
  try {
    $p = Start-Process -FilePath $file -ArgumentList $arguments -Credential $cred -WorkingDirectory $work -WindowStyle Hidden -PassThru
    if ($NoWait) { return $p }
    if (-not $p.WaitForExit($timeoutSec * 1000)) { $p.Kill(); return 'timeout' }
    return $p.ExitCode
  } finally { $env:TEMP = $oldTemp; $env:TMP = $oldTmp }
}

$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$hostsHashBefore = (Get-FileHash $hostsPath -Algorithm SHA256).Hash
$installDir = Join-Path $env:ProgramFiles 'monBlock'
$dataDir = Join-Path $env:ProgramData 'monBlock'

try {
  # 1. Instalacao silenciosa.
  $p = Start-Process $Setup -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$work\setup.log" -Wait -PassThru
  Check 'setup.exitcode' ($p.ExitCode -eq 0) $p.ExitCode
  $svc = Get-CimInstance Win32_Service -Filter "Name='monblockd'"
  Check 'servico.running' ($svc.State -eq 'Running') $svc.State
  Check 'servico.localsystem' ($svc.StartName -eq 'LocalSystem') $svc.StartName
  Check 'servico.auto' ($svc.StartMode -eq 'Auto') $svc.StartMode
  Check 'pipe' ($null -ne (WaitFor { PipeUp } 20))
  $dpid = DaemonPid
  Check 'daemon.system' ((Get-Process -Id $dpid -IncludeUserName).UserName -match 'SYSTEM|SISTEMA') (Get-Process -Id $dpid -IncludeUserName).UserName
  Check 'app.instalado' (Test-Path (Join-Path $installDir 'app\monBlock.exe'))
  Check 'atalho.inicializacao' (Test-Path "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\monBlock.lnk")
  Check 'sem.desinstalador' (-not (Test-Path "$installDir\unins000.exe"))

  # 2. Camadas 1 e 2 aplicadas no boot (estado padrao: Adulto).
  $null = WaitFor { (Get-Content $hostsPath -Raw) -match 'MONBLOCK START' } 30
  Check 'hosts.bloco' ((Get-Content $hostsPath -Raw) -match 'MONBLOCK START')
  $edge = (reg query 'HKLM\SOFTWARE\Policies\Microsoft\Edge\URLBlocklist' 2>&1 | Out-String)
  Check 'registro.edge' ($edge -match 'REG_SZ')

  # 3. Usuario comum: GET_STATE e MUTATE_RULES pelo pipe em < 2 s cada.
  $client = Join-Path $work 'client.mjs'
  @'
import fs from 'node:fs';
import net from 'node:net';
const out = process.argv[2];
const sock = net.connect('\\\\.\\pipe\\monblockd');
const r = {};
try {
  await new Promise((res, rej) => { sock.once('connect', res); sock.once('error', rej); });
  let buf = ''; const waiters = new Map(); let id = 0;
  sock.on('data', (c) => { buf += c; let nl; while ((nl = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1); waiters.get(m.id)?.(m.response); } });
  const call = (cmd) => new Promise((res) => { const i = ++id; const a = Date.now(); const t = setTimeout(() => res({ ms: 15000 }), 15000); waiters.set(i, (response) => { clearTimeout(t); res({ ms: Date.now() - a, response }); }); sock.write(JSON.stringify({ id: i, cmd }) + '\n'); });
  const s = await call({ type: 'GET_STATE' });
  r.getState = { ms: s.ms, status: s.response?.status };
  const rules = s.response.state.rules;
  const m = await call({ type: 'MUTATE_RULES', rules: { ...rules, blockedDomains: [...rules.blockedDomains, 'e2e-probe.example'] } });
  r.mutate = { ms: m.ms, status: m.response?.status };
} catch (e) { r.error = e.code ?? String(e); }
fs.writeFileSync(out, JSON.stringify(r));
sock.destroy();
'@ | Set-Content -Encoding utf8 $client
  $res = AsUser $node @("`"$client`"", "`"$work\client.json`"")
  $c = Get-Content "$work\client.json" -Raw | ConvertFrom-Json
  Check 'ipc.usuario.get_state' ($c.getState.status -eq 200 -and $c.getState.ms -lt 2000) "$($c.getState.ms) ms"
  Check 'ipc.usuario.mutate' ($c.mutate.status -eq 200 -and $c.mutate.ms -lt 2000) "$($c.mutate.ms) ms $($c.error)"
  Check 'hosts.mutate' ($null -ne (WaitFor { (Get-Content $hostsPath -Raw) -match 'e2e-probe\.example' } 10))

  # 4. W21: o verificador, como usuario comum, reconhece o servico real.
  $check = Join-Path $installDir 'pipe-server-check.ps1'
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $null = AsUser $ps @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', "& '$check' -PipeName monblockd | Set-Content '$work\w21-real.json'")
  Check 'w21.servico_real' ((Get-Content "$work\w21-real.json" -Raw) -match '"verified":\s*true') (Get-Content "$work\w21-real.json" -Raw)

  # 5. taskkill no daemon: volta em <= 15 s (WinSW + acoes de falha do SCM).
  $old = DaemonPid
  taskkill /f /pid $old | Out-Null
  $back = WaitFor { $n = DaemonPid; $n -and $n -ne $old -and (PipeUp) } 30
  Check 'taskkill.volta' ($null -ne $back -and $back -le 15) "$back s"

  # 6. Impostor: servico parado, usuario comum servindo o pipe -> verificador recusa.
  Stop-Service monblockd
  $imp = Join-Path $work 'impostor.mjs'
  "import net from 'node:net'; net.createServer(() => {}).listen('\\\\.\\pipe\\monblockd'); setTimeout(() => process.exit(0), 60000);" | Set-Content -Encoding utf8 $imp
  $impProc = AsUser $node @("`"$imp`"") -NoWait
  $null = WaitFor { PipeUp } 15
  $null = AsUser $ps @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', "& '$check' -PipeName monblockd | Set-Content '$work\w21-imp.json'")
  Check 'w21.impostor_recusado' ((Get-Content "$work\w21-imp.json" -Raw) -match '"verified":\s*false') (Get-Content "$work\w21-imp.json" -Raw)
  Get-Process -Id $impProc.Id -ErrorAction SilentlyContinue | Stop-Process -Force
  $null = WaitFor { -not (PipeUp) } 10
  Start-Service monblockd
  Check 'servico.religado' ($null -ne (WaitFor { PipeUp } 20))

  # 7. Desinstalacao autorizada (W12): o mesmo agendamento que o daemon faz apos o UNINSTALL_AUTHORIZED
  #    (o comando em si exige o Ajudante, que nao existe no runner).
  & $node -e "import('file:///$($repo.Replace('\','/'))/dist/daemon/windows-uninstall.js').then((m) => process.exit(m.scheduleWindowsUninstall(process.argv[1]) ? 0 : 1))" $installDir
  Check 'uninstall.agendado' ($LASTEXITCODE -eq 0)
  $gone = WaitFor { -not (Get-Service monblockd -ErrorAction SilentlyContinue) -and -not (Test-Path $installDir) -and -not (Test-Path $dataDir) } 120
  Check 'limpo.servico_e_pastas' ($null -ne $gone) "$gone s"
  $null = WaitFor { -not ((schtasks /query /tn 'monBlock\Uninstall' 2>&1 | Out-String) -match 'Uninstall') } 30
  Check 'limpo.tarefa' (-not ((schtasks /query /tn 'monBlock\Uninstall' 2>&1 | Out-String) -match 'monBlock'))
  Check 'limpo.hosts_hash' ((Get-FileHash $hostsPath -Algorithm SHA256).Hash -eq $hostsHashBefore)
  $left = foreach ($k in 'Google\Chrome', 'Microsoft\Edge', 'BraveSoftware\Brave', 'Chromium', 'Vivaldi', 'Mozilla\Firefox') {
    (reg query "HKLM\SOFTWARE\Policies\$k" /s 2>&1 | Out-String) | Where-Object { $_ -match 'REG_' }
  }
  Check 'limpo.registro' (-not $left) "$left"
  Check 'limpo.atalhos' (-not (Test-Path "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\monBlock.lnk"))
} catch {
  Check 'excecao' $false $_.Exception.Message
} finally {
  net user mbe2e /delete | Out-Null
  $results | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $work 'e2e-results.json')
  Get-Content "$env:ProgramData\monBlock-uninstall.log" -ErrorAction SilentlyContinue | Write-Host
  foreach ($f in Get-ChildItem "$dataDir\logs" -Filter '*.log' -ErrorAction SilentlyContinue) { Write-Host "== $($f.Name)"; Get-Content $f.FullName -Tail 30 }
}
if ($failures.Count -gt 0) { throw "E2E falhou: $($failures -join ', ')" }
Write-Host 'E2E Windows: tudo verde.'
