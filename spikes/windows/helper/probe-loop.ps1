# Helper persistente candidato (W8). Lê comandos de stdin, uma linha por vez; responde JSON por linha.
# Rodar: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File probe-loop.ps1
$src = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
'@
try {
  Add-Type -TypeDefinition $src -ErrorAction Stop
} catch {
  [Console]::Out.WriteLine((@{ error = 'add-type'; mode = $ExecutionContext.SessionState.LanguageMode.ToString(); detail = $_.Exception.Message } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  exit 3
}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ($line -ne 'probe') { [Console]::Out.WriteLine('{"error":"unknown"}'); [Console]::Out.Flush(); continue }
  $h = [Fg]::GetForegroundWindow()
  [uint32]$procId = 0
  [void][Fg]::GetWindowThreadProcessId($h, [ref]$procId)
  $sb = [Text.StringBuilder]::new(512)
  [void][Fg]::GetWindowText($h, $sb, 512)
  $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
  [Console]::Out.WriteLine((@{ proc = $name; title = $sb.ToString() } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
