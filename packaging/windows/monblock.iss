; Instalador do monBlock para Windows (Inno Setup 6, ADR-0016 D3).
; Compilado por scripts\build-windows-setup.ps1 com /DAppVersion, /DDaemonDir, /DAppDir e /DOutputDir.
; - PrivilegesRequired=admin: instala o servico SYSTEM e escreve em %ProgramFiles%.
; - Uninstallable=no: sem entrada em "Aplicativos"; a remocao so acontece pelo fluxo autorizado pelo
;   Ajudante (tarefa agendada que roda uninstall.ps1, W12).
; - PrepareToInstall: para o servico antes de um upgrade (o binario em uso nao pode ser sobrescrito).

#ifndef AppVersion
  #error Informe /DAppVersion
#endif

[Setup]
AppId={{6B0E1C2A-4F7D-4B8E-9A61-3C5D2E8F7A10}
AppName=monBlock
AppVersion={#AppVersion}
AppVerName=monBlock {#AppVersion}
AppPublisher=CCAT
DefaultDirName={autopf}\monBlock
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
Uninstallable=no
CreateUninstallRegKey=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19045
OutputDir={#OutputDir}
OutputBaseFilename=monBlock-Setup-{#AppVersion}
SetupIconFile=monblock.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=force
RestartApplications=no
SetupLogging=yes

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "{#DaemonDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#AppDir}\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Mesmo AppUserModelID do app (W14): o toast sai com o nome "monBlock".
Name: "{commonprograms}\monBlock"; Filename: "{app}\app\monBlock.exe"; AppUserModelID: "com.ccat.monblock"
; Autostart no logon (W19), minimizado na bandeja. Sem opcao de desligar: a Camada 3 depende dele.
Name: "{commonstartup}\monBlock"; Filename: "{app}\app\monBlock.exe"; Parameters: "--hidden"; AppUserModelID: "com.ccat.monblock"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -SourceDir ""{app}"""; \
  StatusMsg: "Instalando o serviço de proteção..."; Flags: runhidden waituntilterminated
Filename: "{app}\app\monBlock.exe"; Description: "Abrir o monBlock"; Flags: nowait postinstall skipifsilent runasoriginaluser

[Code]
function ServiceExists(): Boolean;
var
  Code: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\sc.exe'), 'query monblockd', '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
end;

function ServiceStopped(): Boolean;
var
  Code: Integer;
  Tmp: String;
  Lines: TArrayOfString;
  I: Integer;
begin
  Result := False;
  Tmp := ExpandConstant('{tmp}\monblockd-state.txt');
  if Exec(ExpandConstant('{cmd}'), '/C ' + ExpandConstant('{sys}\sc.exe') + ' query monblockd > "' + Tmp + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) then
    if LoadStringsFromFile(Tmp, Lines) then
      for I := 0 to GetArrayLength(Lines) - 1 do
        if Pos('STOPPED', Uppercase(Lines[I])) > 0 then
          Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code, Waited: Integer;
  WinSW: String;
begin
  Result := '';
  if not ServiceExists() then exit;
  WinSW := ExpandConstant('{app}\monblockd-service.exe');
  if FileExists(WinSW) then
    Exec(WinSW, 'stop', '', SW_HIDE, ewWaitUntilTerminated, Code)
  else
    Exec(ExpandConstant('{sys}\sc.exe'), 'stop monblockd', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Waited := 0;
  while (not ServiceStopped()) and (Waited < 30000) do
  begin
    Sleep(500);
    Waited := Waited + 500;
  end;
  if not ServiceStopped() then
    Result := 'Não foi possível parar o serviço monBlock em 30 s. Nada foi alterado; tente de novo.';
end;
