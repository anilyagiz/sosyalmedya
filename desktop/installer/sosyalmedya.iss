; sosyalmedya Windows installer (Inno Setup 6)
;   iscc /DStageDir=C:\...\stage /DAppVersion=1.0.0 /DOutputDir=C:\...\out sosyalmedya.iss

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef StageDir
  #error StageDir is required
#endif
#ifndef IconFile
  #error IconFile is required
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif

#define AppName "sosyalmedya"
#define AppExe "sosyalmedya.exe"

[Setup]
AppId={{6B0E5F7A-3C1D-4E8B-9A57-50C1A1D0B7E2}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppName}
AppPublisherURL=https://github.com/anilyagiz/sosyalmedya
AppSupportURL=https://github.com/anilyagiz/sosyalmedya
; Per-user install: no admin rights, no UAC prompt.
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#AppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DefaultGroupName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
SetupIconFile={#IconFile}
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#OutputDir}
OutputBaseFilename=sosyalmedya-kurulum-{#AppVersion}
Compression=lzma2/normal
SolidCompression=yes
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=4
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "tr"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaüstüne kısayol oluştur"; GroupDescription: "Kısayollar:"

[InstallDelete]
; Remove files of the previous version so nothing stale is left behind.
; User data lives in %LOCALAPPDATA%\sosyalmedya\data and is never touched.
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\resources"

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "sosyalmedya'yı şimdi başlat"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM {#AppExe} /T /F"; Flags: runhidden; RunOnceId: "KillApp"
Filename: "{app}\runtime\pgsql\bin\pg_ctl.exe"; Parameters: "stop -D ""{localappdata}\{#AppName}\data\postgres"" -m fast -w -t 60"; Flags: runhidden skipifdoesntexist; RunOnceId: "StopDb"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
procedure StopRunningApp();
var
  ResultCode: Integer;
  PgCtl: String;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/IM {#AppExe} /T /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  PgCtl := ExpandConstant('{app}\runtime\pgsql\bin\pg_ctl.exe');
  if FileExists(PgCtl) then
    Exec(PgCtl, 'stop -D "' + ExpandConstant('{localappdata}\{#AppName}\data\postgres') + '" -m fast -w -t 60', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  // Processes started by the app from this folder (node, redis, temporal).
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -Command "Get-Process | Where-Object { $_.Path -like ''' + ExpandConstant('{app}') + '\*'' } | Stop-Process -Force"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopRunningApp();
  Result := '';
end;

function InitializeUninstall(): Boolean;
begin
  StopRunningApp();
  Result := True;
end;
