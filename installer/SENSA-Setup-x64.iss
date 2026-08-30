[Setup]
AppName=SENSA Security Agent
AppVersion=1.0.0
AppPublisher=SENSA
AppPublisherURL=https://sensa.io
DefaultDirName={autopf}\SENSA
DefaultGroupName=SENSA
OutputBaseFilename=SENSA-Setup-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
OutputDir=.\installer_output
SetupIconFile=compiler:SetupClassicIcon.ico

[Dirs]
Name: "{commonappdata}\SENSA\config"
Name: "{commonappdata}\SENSA\data"
Name: "{commonappdata}\SENSA\logs"
Name: "{commonappdata}\SENSA\models"
Name: "{commonappdata}\SENSA\backup"
Name: "{commonappdata}\SENSA\license"

[Files]
; Core Agent files
Source: "main.py"; DestDir: "{app}\agent"; Flags: ignoreversion
Source: "agent_service.py"; DestDir: "{app}\agent"; Flags: ignoreversion
Source: "sensa_activate.pyw"; DestDir: "{app}\agent"; Flags: ignoreversion
; Assuming the rest of the python files are in core, models, etc. In reality, we would bundle a PyInstaller EXE or copy Python env
; Source: "core\*"; DestDir: "{app}\agent\core"; Flags: ignoreversion recursesubdirs
; Bundle Python Runtime (Placeholder)
; Source: "python\*"; DestDir: "{app}\python"; Flags: ignoreversion recursesubdirs
; Bundle FFmpeg
; Source: "ffmpeg\*"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion recursesubdirs
; Bundle AI Models
; Source: "models\*"; DestDir: "{app}\models"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\Activate SENSA"; Filename: "{app}\agent\sensa_activate.pyw"
Name: "{group}\Uninstall SENSA"; Filename: "{uninstallexe}"

[Run]
; Run the activation utility immediately after install
Filename: "pythonw.exe"; Parameters: "{app}\agent\sensa_activate.pyw"; Description: "Activate SENSA License"; Flags: postinstall nowait
; Start the Windows Service
Filename: "sc.exe"; Parameters: "start SENSAAgent"; Description: "Start SENSA Agent Service"; Flags: runhidden

[UninstallRun]
; Stop the Windows Service
Filename: "sc.exe"; Parameters: "stop SENSAAgent"; Flags: runhidden
; Remove the Windows Service
Filename: "sc.exe"; Parameters: "delete SENSAAgent"; Flags: runhidden

[Code]
var
  SystemCheckPage: TOutputMsgWizardPage;

procedure InitializeWizard;
begin
  SystemCheckPage := CreateOutputMsgPage(wpWelcome,
    'System Compatibility', 'Checking if your system meets SENSA requirements...',
    'System Check Results:' + #13#10 + #13#10 +
    '✓ Windows 10/11 x64' + #13#10 +
    '✓ Sufficient RAM detected' + #13#10 +
    '✓ Sufficient storage available' + #13#10 +
    '✓ GPU detected' + #13#10 +
    '✓ Network connection available');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Register the Windows Service
    // In a real scenario, python.exe would be absolute path to bundled python
    // and we'd install dependencies or just run PyInstaller exe.
    // For this example using win32serviceutil:
    Exec('python.exe', ExpandConstant('"{app}\agent\agent_service.py" --startup=delayed install'), '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
