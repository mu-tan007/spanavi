-- Zoom の画面よけ（架電画面用・Mac 版）
-- -----------------------------------------------------------------------------
-- Windows 版（zoom-window-guard-1.1.4.ahk）と同じことを、Mac の Hammerspoon で行う。
-- 発信（zoomphonecall://）のたびに Zoom の通話画面が前に出て、架電画面（ブラウザ）に重なる。
-- Zoom にはこれを止める設定が無い（2026-10-02 調査）。
-- そこで、発信の直後に出てきた Zoom の画面をしまい（Dock に最小化）、ブラウザを前に戻す。
--
-- 置き場は ~/.hammerspoon/zoom-window-guard.lua。~/.hammerspoon/init.lua の require で読み込む。
-- 入れるのは zoom-window-guard-mac.sh（ターミナルに1行貼るだけ）。
--
-- ⚠️ 対象は「ブラウザで操作した直後（6秒以内）に前に出た Zoom の画面」だけ。
-- ⚠️ ミーティング・ウェビナーの画面と、着信の知らせはしまわない。
-- ⚠️ 一度しまった通話の画面は、つながったときなどに再び前に出ても、通話の間（90秒）はしまい続ける。
-- ⚠️ 人が自分で Zoom を開いたとき（Dock・Command+Tab・Zoom の画面をクリック）は、
--    次にブラウザで操作するまでその画面をしまわない。
-- ⚠️ Control+Option+Z で一時停止・再開。メニューバーの「Z」からも止められる。
-- ⚠️ 何をしたかは ~/Library/Logs/ZoomWindowGuard/zoom-window-guard.log に1行ずつ残す（効かないときの手がかり）。
--    Mac の Zoom の画面の名前・種類（role / subrole）は Windows と違うので、最初はこの記録を見て合わせ込む。
-- ⚠️ 版（VERSION）は配布ファイルの名前と起動時の記録に使う。中身を変えたら上げる。

local VERSION = "1.0.0"

local M = {}

local ZOOM_APP = "zoom.us"
local BROWSERS = {
  ["com.google.Chrome"] = true,
  ["com.microsoft.edgemac"] = true,
  ["org.mozilla.firefox"] = true,
  ["com.brave.Browser"] = true,
  ["com.apple.Safari"] = true,
  ["company.thebrowser.Browser"] = true,   -- Arc
}
local BROWSER_NAMES = { ["Phalanx"] = true }   -- PC版のPhalanx

local logDir = os.getenv("HOME") .. "/Library/Logs/ZoomWindowGuard"
local logFile = logDir .. "/zoom-window-guard.log"

local paused = false
local lastClick = 0             -- 最後にマウスを押した時刻（秒）
local lastClickOnBrowser = false
local lastBrowserInput = 0      -- ブラウザで最後に操作した時刻
local lastSwitch = 0            -- 最後に Command+Tab で切り替えた時刻
local cmdTabbing = false
local lastBrowserWin = nil
local managed = {}              -- しまった Zoom の画面（id → true）
local released = {}             -- 人が開いた Zoom の画面（id → 開いた時刻）

local function now() return hs.timer.secondsSinceEpoch() end

local function log(msg)
  hs.fs.mkdir(logDir)
  local f = io.open(logFile, "a")
  if f then
    f:write(os.date("%Y-%m-%d %H:%M:%S") .. " " .. msg .. "\n")
    f:close()
  end
end

local function notify(text)
  hs.notify.new({ title = "Zoomの画面よけ", informativeText = text }):send()
end

local function isBrowserApp(app)
  if not app then return false end
  return BROWSERS[app:bundleID() or ""] or BROWSER_NAMES[app:name() or ""] or false
end

-- クリックの位置にある画面がブラウザか（押した瞬間に見る。Windows 版 1.1.1 と同じ理由）。
local function browserAt(pos)
  local ok, el = pcall(function()
    return hs.axuielement.systemWideElement():elementAtPosition(pos.x, pos.y)
  end)
  if not ok or not el then return false end
  local pid = el:pid()
  if not pid then return false end
  return isBrowserApp(hs.application.applicationForPID(pid))
end

local function noteBrowserInput()
  local app = hs.application.frontmostApplication()
  if isBrowserApp(app) then
    lastBrowserInput = now()
    local w = app:focusedWindow()
    if w then lastBrowserWin = w end
  end
end

-- 発信の操作として数えるキー：Enter・スペース・F1〜F8・Control+←→（架電画面の操作）。
local KEYS = {}
for _, k in ipairs({ "return", "padenter", "space", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8" }) do
  local code = hs.keycodes.map[k]
  if code then KEYS[code] = "any" end
end
for _, k in ipairs({ "left", "right" }) do
  local code = hs.keycodes.map[k]
  if code then KEYS[code] = "ctrl" end
end

local types = hs.eventtap.event.types
M.tap = hs.eventtap.new({ types.leftMouseDown, types.rightMouseDown, types.keyDown, types.flagsChanged }, function(e)
  local t = e:getType()
  if t == types.leftMouseDown or t == types.rightMouseDown then
    lastClick = now()
    lastClickOnBrowser = browserAt(e:location())
    if lastClickOnBrowser and t == types.leftMouseDown then
      lastBrowserInput = now()
      local app = hs.application.frontmostApplication()
      if isBrowserApp(app) and app:focusedWindow() then lastBrowserWin = app:focusedWindow() end
    end
  elseif t == types.keyDown then
    local code = e:getKeyCode()
    local flags = e:getFlags()
    if code == hs.keycodes.map["tab"] and flags.cmd then
      cmdTabbing = true
    elseif KEYS[code] == "any" or (KEYS[code] == "ctrl" and flags.ctrl) then
      noteBrowserInput()
    end
  elseif t == types.flagsChanged then
    if cmdTabbing and not e:getFlags().cmd then
      lastSwitch = now()
      cmdTabbing = false
    end
  end
  return false   -- 操作はそのまま通す
end)

local function focusBrowser()
  if lastBrowserWin and lastBrowserWin:application() then
    lastBrowserWin:focus()
    return
  end
  for _, app in ipairs(hs.application.runningApplications()) do
    if isBrowserApp(app) then
      app:activate()
      return
    end
  end
end

local function describe(win)
  local f = win:frame()
  return string.format("title=%s role=%s subrole=%s size=%dx%d",
    win:title() or "", win:role() or "", win:subrole() or "", math.floor(f.w), math.floor(f.h))
end

local function handle(win, event)
  if paused or not win then return end
  local id = win:id()
  if not id then return end
  if win:isMinimized() then return end
  local f = win:frame()
  if f.w < 160 or f.h < 100 then return end
  local title = win:title() or ""
  local subrole = win:subrole() or ""
  local t = now()

  -- ⚠️ ミーティング・ウェビナーの画面はしまわない（ブラウザの招待リンクから入った直後に消えると困る）。
  if title:find("ミーティング") or title:find("ウェビナー") or title:lower():find("meeting") or title:lower():find("webinar") then
    log("ミーティングの画面（そのまま） " .. describe(win))
    return
  end
  -- ⚠️ 着信の知らせはしまわない（ブラウザで操作した直後に着信が重なっても）。
  if title:find("着信") or title:lower():find("incoming") or subrole == "AXSystemDialog" then
    managed[id] = nil
    log("知らせの画面（そのまま） " .. describe(win))
    return
  end
  -- 人がクリック・Dock・Command+Tab で Zoom を開いたときは、次にブラウザで操作するまでしまわない。
  if (event == "windowFocused" or event == "windowUnminimized")
      and ((t - lastClick < 0.5 and not lastClickOnBrowser) or t - lastSwitch < 0.8) then
    released[id] = t
    managed[id] = nil
    log("人が開いた（次にブラウザで操作するまでしまわない） " .. describe(win))
    return
  end
  if released[id] then
    if released[id] > lastBrowserInput then return end
    released[id] = nil
  end
  -- 発信の直後（6秒以内）に出た画面と、通話の間（90秒以内）に再び出たしまった画面だけを対象にする。
  local isDial = t - lastBrowserInput < 6
  local inCall = t - lastBrowserInput < 90 and managed[id]
  if not (isDial or inCall) then
    log("対象外（発信の直後ではない） " .. describe(win))
    return
  end
  managed[id] = true
  -- 普通の画面は Dock に最小化する（Dock から開き直せる）。最小化できない小さな画面は、Zoom ごと隠す
  -- （Dock の Zoom を押せば戻る）。どちらが効いたかは記録を見て合わせ込む。
  local how
  if win:isStandard() and win:minimize() then
    how = "しまった"
  else
    local app = win:application()
    if app then app:hide() end
    how = "Zoomごと隠した"
  end
  log(how .. " " .. describe(win) .. " event=" .. event .. (isDial and "（発信の直後）" or "（再表示）"))
  hs.timer.doAfter(0.05, focusBrowser)
end

local function onZoomWindow(win, _, event)
  -- 出た直後は大きさや状態が固まっていないことがあるので、少し待って見る。
  hs.timer.doAfter(0.08, function()
    local ok, err = pcall(handle, win, event)
    if not ok then log("エラー " .. tostring(err)) end
  end)
end

local function setPaused(p)
  paused = p
  if M.menu then M.menu:setTitle(paused and "Z⏸" or "Z") end
  notify(paused and "一時停止しました。Control+Option+Z で再開します。" or "再開しました。")
  log(paused and "一時停止" or "再開")
end

local function start()
  M.filter = hs.window.filter.new(false):setAppFilter(ZOOM_APP, { allowRoles = "*", visible = true })
  M.filter:subscribe({
    hs.window.filter.windowCreated,
    hs.window.filter.windowFocused,
    hs.window.filter.windowUnminimized,
    hs.window.filter.windowVisible,
  }, onZoomWindow)
  M.tap:start()
  -- ⚠️ macOS は重いときに聞き取りを黙って止めることがある。止まっていたら入れ直す。
  M.watch = hs.timer.doEvery(5, function()
    if not M.tap:isEnabled() then
      M.tap:start()
      log("聞き取りが止まっていたので入れ直した")
    end
  end)
  M.hotkey = hs.hotkey.bind({ "ctrl", "alt" }, "z", function() setPaused(not paused) end)
  M.menu = hs.menubar.new()
  M.menu:setTitle("Z")
  M.menu:setTooltip("Zoomの画面よけ（Control+Option+Zで一時停止）")
  M.menu:setMenu(function()
    return {
      { title = "Zoomの画面よけ 版 " .. VERSION, disabled = true },
      { title = paused and "再開する" or "一時停止する", fn = function() setPaused(not paused) end },
      { title = "記録を開く", fn = function() hs.execute("open -a TextEdit " .. string.format("%q", logFile)) end },
    }
  end)
  log("起動 版 " .. VERSION .. "（macOS " .. hs.host.operatingSystemVersionString() .. "）")
  notify("動いています。Control+Option+Z で一時停止できます。")
end

hs.autoLaunch(true)       -- Mac を起動するたびに自動で動く
hs.dockicon.hide()
hs.menuIcon(false)        -- Hammerspoon 自身のアイコンは出さない（「Z」だけ）

-- ⚠️ アクセシビリティの許可が無いと、画面をしまえず操作も聞き取れない。許可されるまで2秒ごとに見て、
--    許可されたら読み込み直す（許可の前に作った聞き取りは効かないため）。
if hs.accessibilityState(true) then
  start()
else
  log("アクセシビリティの許可待ち 版 " .. VERSION)
  notify("「システム設定 → プライバシーとセキュリティ → アクセシビリティ」で Hammerspoon をオンにしてください。")
  M.waitAccess = hs.timer.doEvery(2, function()
    if hs.accessibilityState(false) then
      M.waitAccess:stop()
      hs.reload()
    end
  end)
end

_G.zoomWindowGuard = M   -- 消されないように持っておく（Hammerspoon の決まり）
return M
