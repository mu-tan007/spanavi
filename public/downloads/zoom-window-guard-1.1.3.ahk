#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent

; Zoom の画面よけ（架電画面用）
; -----------------------------------------------------------------------------
; 発信（zoomphonecall://）のたびに Zoom の通話画面が前に出て、架電画面（ブラウザ）に重なる。
; Zoom にはこれを止める設定が無い（2026-10-02 調査）。
; そこで、発信の直後に出てきた Zoom の画面を最小化（タスクバーにしまう）し、ブラウザを前に戻す。
; どのモニターにも出さない（2026-10-02）。
;
; ⚠️ 対象は「ブラウザで操作した直後（6秒以内）に前に出た Zoom の画面」だけ。
;    着信の知らせ（Toast・Notification の画面）は、発信の直後でもしまわない（電話を取り逃がさないため）。
; ⚠️ 一度しまった通話の画面は、つながったときなどに再び前に出ても、閉じるまでしまい続ける。
; ⚠️ 人が自分で Zoom の画面をクリックしたとき（切る・ミュート・保留）は動かさない。
;    タスクバーの Zoom を押すか Alt+Tab で開けば、その画面は次にブラウザで操作するまでしまわない。
;    ⚠️ 「次にブラウザで操作するまで」に限る（1.1.1〜）。Zoom の本体の画面は発信ごとに作り直されず同じ画面が
;    使い回されるので、「以後ずっとしまわない」にすると、一度開いただけで以後の発信が全部しまえなくなった（2026-10-04）。
; ⚠️ Ctrl + Alt + Z で一時停止・再開。止めたいときはタスクトレイの H アイコンを右クリック → Exit。
; ⚠️ 何をしたかは %LOCALAPPDATA%\ZoomWindowGuard\zoom-window-guard.log に1行ずつ残す（効かないときの手がかり）。
; ⚠️ 置き場と自動起動は自分で整える（1.1.0〜・2026-10-04「入れる人の手間を減らす」）。
;    どこでダブルクリックされても、%LOCALAPPDATA%\ZoomWindowGuard に自分を写し、スタートアップに
;    「Zoomの画面よけ」のショートカットを置き、写した方を起動して自分は終わる（ダウンロードしたファイルは消してよい）。
;    前の版で手で置いたショートカット（zoom-window-guard を指すもの）は消し、動いている前の版も止める（2つ動かさない）。
; ⚠️ 版（guardVersion）は配布ファイルの名前と起動時の記録に使う。中身を変えたら上げる。
;    文字コードは UTF-8（BOM付き）。日本語の文字を、どのPCでも同じに読ませるため（AutoHotkey 公式の推奨）。

global guardVersion := "1.1.3"
global paused := false
global lastClick := 0          ; 最後にマウスを押した時刻
global lastClickOnBrowser := false   ; そのクリックがブラウザの上だったか（押した瞬間に見る）
global lastBrowserInput := 0   ; ブラウザが前のときに最後に操作した時刻
global lastBrowser := 0
global lastSwitch := 0         ; 最後に Alt+Tab で画面を切り替えた時刻
global altTabbing := false
global managed := Map()        ; しまった Zoom の画面（hwnd → true）
global released := Map()       ; 人が開いた Zoom の画面（hwnd → 開いた時刻。次にブラウザで操作するまでしまわない）
global installDir := EnvGet("LOCALAPPDATA") "\ZoomWindowGuard"
global installPath := installDir "\zoom-window-guard.ahk"
global startupLink := A_Startup "\Zoomの画面よけ.lnk"
global logFile := installDir "\zoom-window-guard.log"
global browsers := Map("chrome.exe", 1, "msedge.exe", 1, "firefox.exe", 1, "brave.exe", 1, "phalanx.exe", 1)   ; phalanx.exe は PC版のPhalanx

try DirCreate installDir
EnsureInstalled()
A_IconTip := "Zoomの画面よけ（Ctrl+Alt+Zで一時停止）"
if (A_Args.Length && A_Args[1] = "installed")
    TrayTip "Zoomの画面よけ", "入れ終わりました。PCを起動するたびに自動で動きます。", 1
else
    TrayTip "Zoomの画面よけ", "動いています。Ctrl+Alt+Z で一時停止できます。", 1

; 置き場に写す・スタートアップに置く・前の版を片付ける。置き場の外で起動されたら、写した方を起動して終わる。
EnsureInstalled() {
    global installPath, startupLink, guardVersion
    here := A_ScriptFullPath
    outside := StrLower(here) != StrLower(installPath)
    if outside {
        try {
            FileCopy here, installPath, 1
            Log("置き場に写した 版 " guardVersion "（" here "）")
        } catch as e {
            Log("置き場に写せなかった（" e.Message "）。この場所のまま動く")
            installPath := here
            outside := false
        }
    }
    ; 前の版で手で置いたショートカットを消す（同じ道具を2つ動かさない）。
    Loop Files A_Startup "\*.lnk" {
        try {
            FileGetShortcut A_LoopFileFullPath, &target
            if InStr(StrLower(target), "zoom-window-guard") && StrLower(target) != StrLower(installPath) {
                FileDelete A_LoopFileFullPath
                Log("前のショートカットを消した（" A_LoopFileName "）")
            }
        }
    }
    try {
        FileCreateShortcut installPath, startupLink, installDir, , "Zoomの画面よけ（PCの起動時に自動で動く）"
    } catch as e {
        Log("スタートアップに置けなかった（" e.Message "）")
    }
    ; ほかの場所から動いている前の版を止める（置き場の版は、下の Run が #SingleInstance Force で入れ替える）。
    prev := A_DetectHiddenWindows
    DetectHiddenWindows true
    for hwnd in WinGetList("ahk_class AutoHotkey") {
        if (hwnd = A_ScriptHwnd)
            continue
        try title := StrLower(WinGetTitle("ahk_id " hwnd))
        catch
            continue
        if InStr(title, "zoom-window-guard") && !InStr(title, StrLower(installPath)) {
            WinClose "ahk_id " hwnd
            Log("前の版を止めた（" title "）")
        }
    }
    DetectHiddenWindows prev
    if outside {
        Run '"' A_AhkPath '" "' installPath '" installed', installDir
        ExitApp
    }
}

; ⚠️ クリックがブラウザの上だったかは、押した瞬間に見る（1.1.1〜）。後から見ると、発信の直後に
;    マウスの真下に出た Zoom の画面を「人がクリックして開いた」と取り違えた（2026-10-04 スパナビで発生）。
; ⚠️ ブラウザの上を押したら、前にある画面が Zoom（通話の小さな画面など）でも発信の操作として数える（1.1.3〜）。
;    押した瞬間はまだ Zoom が前にいるので、前の画面だけで見ると2回目以降の発信を数え損ねた（2026-10-05）。
~LButton:: {
    global lastClick := A_TickCount
    global lastClickOnBrowser := BrowserIsUnderMouse()
    if lastClickOnBrowser {
        global lastBrowserInput := A_TickCount
    } else
        NoteBrowserInput()
}
~RButton:: {
    global lastClick := A_TickCount
    global lastClickOnBrowser := BrowserIsUnderMouse()
}
~Enter:: NoteBrowserInput()
~Space:: NoteBrowserInput()
~F1:: NoteBrowserInput()
~F2:: NoteBrowserInput()
~F3:: NoteBrowserInput()
~F4:: NoteBrowserInput()
~F5:: NoteBrowserInput()
~F6:: NoteBrowserInput()
~F7:: NoteBrowserInput()
~F8:: NoteBrowserInput()
~^Right:: NoteBrowserInput()
~^Left:: NoteBrowserInput()
~*Tab:: {
    global altTabbing
    if GetKeyState("Alt")
        altTabbing := true
}
~*LAlt Up::
~*RAlt Up:: {
    global altTabbing, lastSwitch
    if altTabbing
        lastSwitch := A_TickCount
    altTabbing := false
}

^!z:: {
    global paused := !paused
    TrayTip "Zoomの画面よけ", paused ? "一時停止しました。Ctrl+Alt+Z で再開します。" : "再開しました。", 1
    Log(paused ? "一時停止" : "再開")
}

NoteBrowserInput() {
    global lastBrowserInput, browsers
    try {
        proc := StrLower(WinGetProcessName("A"))
        if browsers.Has(proc)
            lastBrowserInput := A_TickCount
    }
}

; 前面の切り替わり（EVENT_SYSTEM_FOREGROUND）、最小化から戻った（EVENT_SYSTEM_MINIMIZEEND）、
; 窓の表示（EVENT_OBJECT_SHOW）、窓の破棄（EVENT_OBJECT_DESTROY）を受け取る。
; ⚠️ 最小化から戻ったも受け取る（1.1.2〜）。2回目からの発信では、Zoom は前回しまった（最小化した）本体の画面を
;    元に戻して前に出す。前に出た合図の時点ではまだ最小化のままなので、それだけでは見逃した（2026-10-05 スパナビで発生）。
global winEventCb := CallbackCreate(OnWinEvent, "F", 7)
DllCall("SetWinEventHook", "UInt", 0x0003, "UInt", 0x0003, "Ptr", 0, "Ptr", winEventCb, "UInt", 0, "UInt", 0, "UInt", 0x0002, "Ptr")
DllCall("SetWinEventHook", "UInt", 0x0017, "UInt", 0x0017, "Ptr", 0, "Ptr", winEventCb, "UInt", 0, "UInt", 0, "UInt", 0x0002, "Ptr")
DllCall("SetWinEventHook", "UInt", 0x8001, "UInt", 0x8002, "Ptr", 0, "Ptr", winEventCb, "UInt", 0, "UInt", 0, "UInt", 0x0002, "Ptr")
Log("起動 版 " guardVersion "（モニター " MonitorGetCount() " 枚・最小化の方式）")

OnWinEvent(hHook, event, hwnd, idObject, idChild, thread, time) {
    if (idObject != 0 || idChild != 0 || !hwnd)
        return
    if (event = 0x8001) {   ; 破棄：覚えていた画面を忘れる
        global managed, released
        if managed.Has(hwnd)
            managed.Delete(hwnd)
        if released.Has(hwnd)
            released.Delete(hwnd)
        return
    }
    fn := Handle.Bind(hwnd, event, 0, A_TickCount)
    SetTimer fn, -60
}

; at … 合図を受けた時刻。「人が開いたか」はこの時刻で見る（見直しで待った分ずれないように・1.1.3〜）。
Handle(hwnd, event, tries := 0, at := 0) {
    global paused, lastClick, lastClickOnBrowser, lastSwitch, lastBrowser, lastBrowserInput, browsers, managed, released
    try {
        if !WinExist("ahk_id " hwnd)
            return
        proc := StrLower(WinGetProcessName("ahk_id " hwnd))
    } catch {
        return
    }
    if browsers.Has(proc) {
        if (event = 0x0003)
            lastBrowser := hwnd
        return
    }
    if (proc != "zoom.exe" || paused)
        return
    try {
        WinGetPos &x, &y, &w, &h, "ahk_id " hwnd
        cls := WinGetClass("ahk_id " hwnd)
        title := WinGetTitle("ahk_id " hwnd)
        minmax := WinGetMinMax("ahk_id " hwnd)
    } catch {
        return
    }
    ; ⚠️ 前に出た・戻ったの合図の直後は、まだ最小化のまま（戻りきっていない）ことがある。少し待って見直す（約1秒まで）。
    if (minmax = -1 && (event = 0x0003 || event = 0x0017) && tries < 6) {
        fn := Handle.Bind(hwnd, event, tries + 1, at)
        SetTimer fn, -150
        return
    }
    if (minmax = -1) {
        if (tries >= 6)
            Log("見送り（約1秒待っても最小化のまま） class=" cls " event=" Format("0x{:04X}", event))
        return
    }
    if (w < 160 || h < 100)
        return
    if !DllCall("IsWindowVisible", "Ptr", hwnd)
        return
    if !at
        at := A_TickCount
    ; ⚠️ ミーティング・ウェビナーの画面はしまわない（ブラウザの招待リンクから入った直後に消えると困る）。
    if RegExMatch(title, "i)ミーティング|ウェビナー|Meeting|Webinar") || InStr(cls, "Conf") {
        Log("ミーティングの画面（そのまま） class=" cls " title=" title)
        return
    }
    ; ⚠️ 着信の知らせはしまわない（ブラウザで操作した直後に着信が重なっても）。
    if RegExMatch(cls, "i)Toast|Notification") {
        if managed.Has(hwnd)
            managed.Delete(hwnd)
        Log("知らせの画面（そのまま） class=" cls " title=" title)
        return
    }
    ; 人がクリックか Alt+Tab で Zoom を開いたときは、その画面をしまわない（次にブラウザで操作するまで）。
    if ((event = 0x0003 || event = 0x0017) && ((at - lastClick < 500 && !lastClickOnBrowser) || at - lastSwitch < 800)) {
        released[hwnd] := A_TickCount
        if managed.Has(hwnd)
            managed.Delete(hwnd)
        Log("人が開いた（次にブラウザで操作するまでしまわない） class=" cls " title=" title)
        return
    }
    if released.Has(hwnd) {
        if (released[hwnd] > lastBrowserInput) {
            Log("見送り（人が開いた画面・次にブラウザで操作するまで） class=" cls)
            return
        }
        released.Delete(hwnd)   ; 開いた後にブラウザで操作した（次の発信）→ またしまう
    }
    ; 発信の直後（ブラウザで操作してから6秒以内）に出た画面と、通話の間（90秒以内）に出た通話の画面だけを対象にする。
    ; ⚠️ 通話の間は、すでにしまった画面の再表示と、つながったときに出る小さな通話画面（SipcallMiniWnd）もしまう（1.1.3〜）。
    ;    90秒を過ぎたら、しまったことのある画面でもしまわない（使い回しの本体を、着信に出たときなどにしまわないように）。
    isDial := (A_TickCount - lastBrowserInput < 6000)
    inCall := (A_TickCount - lastBrowserInput < 90000) && (managed.Has(hwnd) || cls = "SipcallMiniWnd")
    if !(isDial || inCall) {
        Log("対象外（発信の直後ではない） class=" cls " title=" title " size=" w "x" h)
        return
    }
    managed[hwnd] := true
    try WinMinimize "ahk_id " hwnd
    Log("しまった class=" cls " title=" title " size=" w "x" h (isDial ? "（発信の直後）" : "（再表示）"))
    browser := lastBrowser
    if !(browser && WinExist("ahk_id " browser)) {
        browser := 0
        for exe in ["phalanx.exe", "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe"] {
            if (id := WinExist("ahk_exe " exe)) {
                browser := id
                break
            }
        }
    }
    if browser {
        try WinActivate "ahk_id " browser
    }
}

; クリックの位置がブラウザの上なら、それは発信ボタンを押したクリック（Zoom を開いた操作ではない）。
BrowserIsUnderMouse() {
    global browsers
    try {
        MouseGetPos , , &id
        return browsers.Has(StrLower(WinGetProcessName("ahk_id " id)))
    } catch {
        return false
    }
}

Log(msg) {
    global logFile
    try FileAppend FormatTime(, "yyyy-MM-dd HH:mm:ss") " " msg "`n", logFile, "UTF-8"
}
