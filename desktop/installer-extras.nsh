; installer-extras.nsh
; Prerequisite checks injected into the ApexAI NSIS installer.
; Runs before the main installer UI appears.

!include "WinVer.nsh"
!include "LogicLib.nsh"

; ── Minimum disk space required (in KB) ─────────────────────────────────────
!define APEXAI_MIN_DISK_KB 700000   ; ~700 MB

; ─────────────────────────────────────────────────────────────────────────────
; customInit — called before installer UI starts
; ─────────────────────────────────────────────────────────────────────────────
!macro customInit
  ; 1. Windows version check
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP \
      "ApexAI requires Windows 10 or later.$\n$\nPlease upgrade your operating system."
    Abort
  ${EndIf}

  ; 2. Visual C++ Redistributable check
  Call CheckVCRedist
!macroend

; ─────────────────────────────────────────────────────────────────────────────
; customInstall — called during installation (after directory is selected)
; ─────────────────────────────────────────────────────────────────────────────
!macro customInstall
  ; 3. Disk space check on the chosen install drive
  Call CheckDiskSpace
!macroend

; ─────────────────────────────────────────────────────────────────────────────
; CheckVCRedist
; Checks for Microsoft Visual C++ 2015-2022 Redistributable (x64).
; Offers auto-install, manual install, or check-again options.
; ─────────────────────────────────────────────────────────────────────────────
Function CheckVCRedist
  check_start:

  ; Try primary registry key
  ClearErrors
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 == 1
    Return
  ${EndIf}

  ; Try WOW6432Node (32-bit registry view on 64-bit Windows)
  ClearErrors
  ReadRegDWORD $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 == 1
    Return
  ${EndIf}

  ; ── Not found — show options ──────────────────────────────────────────────
  MessageBox MB_YESNOCANCEL|MB_ICONQUESTION \
    "Microsoft Visual C++ Runtime (2015-2022) is required but was not found.$\n$\n\
    $\n\
    YES    — Download and install it automatically (recommended)$\n\
    NO     — Open the download page so I can install it myself$\n\
    CANCEL — I already installed it, check again$\n\
    $\n\
    ApexAI will not start without this component." \
    IDYES  vcredist_auto \
    IDNO   vcredist_manual \
    IDCANCEL check_start

  ; ── Auto install ──────────────────────────────────────────────────────────
  vcredist_auto:
    DetailPrint "Downloading Visual C++ Redistributable..."
    NSISdl::download \
      "https://aka.ms/vs/17/release/vc_redist.x64.exe" \
      "$TEMP\apexai_vc_redist.exe"
    Pop $R0

    ${If} $R0 == "success"
      DetailPrint "Installing Visual C++ Redistributable..."
      ExecWait '"$TEMP\apexai_vc_redist.exe" /install /quiet /norestart' $1
      Delete "$TEMP\apexai_vc_redist.exe"
      ${If} $1 == 0
      ${OrIf} $1 == 3010   ; 3010 = success, reboot required
        DetailPrint "Visual C++ Redistributable installed successfully."
        ${If} $1 == 3010
          MessageBox MB_OK|MB_ICONINFORMATION \
            "Visual C++ Runtime installed.$\n$\nA system reboot is recommended before running ApexAI."
        ${EndIf}
        Return
      ${Else}
        MessageBox MB_YESNO|MB_ICONEXCLAMATION \
          "Installation may not have completed (exit code: $1).$\n$\n\
          Click YES to try the manual download, or NO to continue anyway." \
          IDYES vcredist_manual IDNO vcredist_skip
      ${EndIf}
    ${Else}
      MessageBox MB_YESNO|MB_ICONEXCLAMATION \
        "Download failed: $R0$\n$\n\
        Click YES to open the download page manually, or NO to continue anyway." \
        IDYES vcredist_manual IDNO vcredist_skip
    ${EndIf}
    Goto vcredist_done

  ; ── Manual install ────────────────────────────────────────────────────────
  vcredist_manual:
    ExecShell "open" "https://aka.ms/vs/17/release/vc_redist.x64.exe"
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION \
      "The VC++ Redistributable download has been opened.$\n$\n\
      1. Run the downloaded installer$\n\
      2. Click OK below to check again$\n\
      3. Or click Cancel to continue without it (app may not start)" \
      IDOK check_start \
      IDCANCEL vcredist_skip

  ; ── Skip ──────────────────────────────────────────────────────────────────
  vcredist_skip:
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Continuing without Visual C++ Runtime.$\n$\n\
      ApexAI may fail to start. You can install it later from:$\n\
      https://aka.ms/vs/17/release/vc_redist.x64.exe"

  vcredist_done:
FunctionEnd

; ─────────────────────────────────────────────────────────────────────────────
; CheckDiskSpace
; Verifies enough space exists on the target install drive.
; ─────────────────────────────────────────────────────────────────────────────
Function CheckDiskSpace
  ; Get drive letter from $INSTDIR (e.g. "C:\Program Files\ApexAI" → "C:")
  StrCpy $0 $INSTDIR 2   ; First 2 chars = drive letter + colon

  ; Get free space in KB on that drive
  ${GetSize} $0 "/S=K /D=F" $1 $2 $3   ; $1 = free KB

  ${If} $1 < ${APEXAI_MIN_DISK_KB}
    ; Convert to MB for a friendlier message
    IntOp $2 ${APEXAI_MIN_DISK_KB} / 1024
    IntOp $3 $1 / 1024

    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
      "Not enough disk space on drive $0$\n$\n\
      Required: ~$2 MB$\n\
      Available: $3 MB$\n$\n\
      Free up space and click OK to check again, or Cancel to install anyway." \
      IDOK check_space_again \
      IDCANCEL check_space_done

    check_space_again:
      Call CheckDiskSpace
      Return
  ${EndIf}

  check_space_done:
FunctionEnd
