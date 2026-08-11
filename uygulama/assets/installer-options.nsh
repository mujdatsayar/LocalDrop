!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var LocalDropDesktopShortcutCheckbox
Var LocalDropDesktopShortcutState

!macro customInit
  StrCpy $LocalDropDesktopShortcutState ${BST_CHECKED}
  Call LocalDropFinalizeAndValidateInstallPath
!macroend

!macro customPageAfterChangeDir
  Page custom LocalDropOptionsPage LocalDropOptionsPageLeave
!macroend

Function LocalDropOptionsPage
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Ek görevleri seçin"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:LocalDrop kısayol seçeneklerini belirleyin."

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "LocalDrop kurulurken uygulanacak ek görevleri seçin:"
  Pop $0
  ${NSD_CreateCheckbox} 0 36u 100% 14u "Masaüstünde LocalDrop kısayolu oluştur"
  Pop $LocalDropDesktopShortcutCheckbox
  ${NSD_Check} $LocalDropDesktopShortcutCheckbox
  nsDialogs::Show
FunctionEnd

Function LocalDropOptionsPageLeave
  Call LocalDropFinalizeAndValidateInstallPath
  ${NSD_GetState} $LocalDropDesktopShortcutCheckbox $LocalDropDesktopShortcutState
FunctionEnd

Function LocalDropFinalizeAndValidateInstallPath
  Push "$INSTDIR"
  Push "${APP_FILENAME}"
  Call StrContains
  Pop $6
  ${If} $6 == ""
    StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
  ${EndIf}
  Call LocalDropValidateInstallPath
FunctionEnd

Function LocalDropValidateInstallPath
  GetFullPathName $0 "$EXEDIR\.."
  ${IfNot} ${FileExists} "$0\uygulama\package.json"
    Return
  ${EndIf}

  GetFullPathName $1 "$INSTDIR"

  ; Hedef kaynak kökünün aynısı veya alt klasörü mü?
  StrLen $2 $0
  StrCpy $3 $1 $2
  System::Call 'kernel32::lstrcmpi(t r0, t r3) i .r4'
  ${If} $4 == 0
    StrCpy $5 $1 1 $2
    ${If} $5 == ""
    ${OrIf} $5 == "\"
      Goto localdrop_path_blocked
    ${EndIf}
  ${EndIf}

  ; Hedef kaynak kökünün üst klasörü mü? Uninstaller üst klasörü de silebilir.
  StrLen $2 $1
  StrCpy $3 $0 $2
  System::Call 'kernel32::lstrcmpi(t r1, t r3) i .r4'
  ${If} $4 == 0
    StrCpy $5 $0 1 $2
    ${If} $5 == ""
    ${OrIf} $5 == "\"
      Goto localdrop_path_blocked
    ${EndIf}
  ${EndIf}
  Return

  localdrop_path_blocked:
    MessageBox MB_ICONSTOP|MB_OK "Kaynak LocalDrop klasörü, içindeki bir klasör veya onu kapsayan bir üst klasör kurulum hedefi olarak kullanılamaz.$\r$\n$\r$\nLütfen AppData veya Program Files altında ayrı bir klasör seçin."
    Abort
FunctionEnd

!macro customInstall
  ${If} ${FileExists} "$LOCALAPPDATA\LocalDrop\Update.exe"
    ExecWait '"$LOCALAPPDATA\LocalDrop\Update.exe" --uninstall -s' $0
  ${EndIf}
  Delete "$DESKTOP\Electron.lnk"
  ${If} $LocalDropDesktopShortcutState == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\LocalDrop.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$DESKTOP\LocalDrop.lnk" "${APP_ID}"
  ${Else}
    Delete "$DESKTOP\LocalDrop.lnk"
  ${EndIf}
!macroend

!else

!macro customUnInstall
  Delete "$DESKTOP\LocalDrop.lnk"
  Delete "$DESKTOP\Electron.lnk"
!macroend
!endif
