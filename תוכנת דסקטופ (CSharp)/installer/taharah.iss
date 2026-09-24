; Inno Setup script for the C#/WPF desktop edition of לוח טהרה.
; Wraps the self-contained single-file publish output (dist/portable/Taharah.exe)
; into a proper Setup.exe - mirrors the JS/Electron build's NSIS installer
; (package.json's "build.nsis": oneClick=false, perMachine=false, desktop+start menu
; shortcuts) so both editions install the same way for a non-technical user.

#define MyAppName "לוח טהרה"
#define MyAppVersion "3.2.0"
#define MyAppPublisher "Lev Good"
#define MyAppExeName "Taharah.exe"

[Setup]
AppId={{B27F3C1E-6C8A-4A9B-9E2D-3F6A2B1C7D4E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline
OutputDir=..\dist\installer
OutputBaseFilename=לוח טהרה Setup {#MyAppVersion}
SetupIconFile=..\src\Taharah.UI\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "צור קיצור דרך בשולחן העבודה"; GroupDescription: "קיצורי דרך נוספים:"

[Files]
Source: "..\dist\portable\Taharah.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "הפעל את {#MyAppName}"; Flags: nowait postinstall skipifsilent
