# P1: prefixo HKLM\ x HKEY_LOCAL_MACHINE\ no .reg
# P2: codificação aceita pelo reg import com cabeçalho Version 5.00
# P3: [-chave] + recriação remove valores antigos
. "$PSScriptRoot\..\common.ps1"
$base = 'SOFTWARE\Policies\MonBlockSpike'
$dir = Join-Path $SpikeRoot 'reg'
New-Item -ItemType Directory -Force $dir | Out-Null

function Import-Reg([string]$Name, [string]$Body, [string]$Enc = 'utf8') {
  $path = Join-Path $dir "$Name.reg"
  Write-TextFile $path "Windows Registry Editor Version 5.00`n`n$Body`n" $Enc
  return Invoke-Native 'reg.exe' @('import', $path)
}
function Query([string]$Key) { Invoke-Native 'reg.exe' @('query', $Key, '/s') }

try {
  # P1
  $abbrev = Import-Reg 'p1-abbrev' "[HKLM\$base\Abbrev]`n`"v`"=`"1`""
  $full = Import-Reg 'p1-full' "[HKEY_LOCAL_MACHINE\$base\Full]`n`"v`"=`"1`""
  $qa = Query "HKLM\$base\Abbrev"
  $qf = Query "HKLM\$base\Full"
  $abbrevWorks = $qa.exit -eq 0 -and $qa.output -match '\bv\s+REG_SZ\s+1'
  $fullWorks = $qf.exit -eq 0 -and $qf.output -match '\bv\s+REG_SZ\s+1'
  # PASSOU = a premissa da spec ("HKLM\ não funciona, HKEY_LOCAL_MACHINE\ funciona") se confirmou.
  $p1 = if ($fullWorks -and -not $abbrevWorks) { 'PASSOU' } elseif ($fullWorks) { 'FALHOU' } else { 'ERRO' }
  Save-Result 'P1' $p1 @{ abbrevImport = $abbrev; abbrevQuery = $qa; fullImport = $full; fullQuery = $qf; abbrevWorks = $abbrevWorks; fullWorks = $fullWorks; anyOther = (Query "HKLM\$base") }

  # P2
  $enc = [ordered]@{}
  foreach ($e in 'utf8', 'utf8bom', 'utf16bom') {
    $imp = Import-Reg "p2-$e" "[HKEY_LOCAL_MACHINE\$base\Enc-$e]`n`"v`"=`"ok`"" $e
    $q = Query "HKLM\$base\Enc-$e"
    $enc[$e] = @{ import = $imp; works = ($q.exit -eq 0 -and $q.output -match '\bv\s+REG_SZ\s+ok') }
  }
  $p2 = if ($enc['utf8'].works) { 'PASSOU' } else { 'FALHOU' }
  Save-Result 'P2' $p2 $enc

  # P3
  $k = "HKEY_LOCAL_MACHINE\$base\URLBlocklist"
  $first = Import-Reg 'p3-first' "[$k]`n`"1`"=`"a.com`"`n`"2`"=`"b.com`"`n`"3`"=`"c.com`""
  $second = Import-Reg 'p3-second' "[-$k]`n`n[$k]`n`"1`"=`"a.com`""
  $q3 = Query "HKLM\$base\URLBlocklist"
  $only1 = ($q3.output -match '\b1\s+REG_SZ\s+a\.com') -and ($q3.output -notmatch '\b[23]\s+REG_SZ')
  Save-Result 'P3' ($(if ($only1) { 'PASSOU' } else { 'FALHOU' })) @{ first = $first; second = $second; query = $q3 }
} catch {
  Save-Result 'P1-P3' 'ERRO' @{ error = $_.Exception.Message }
} finally {
  reg.exe delete "HKLM\$base" /f 2>&1 | Out-Null
}
