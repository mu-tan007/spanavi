-- Zoom の画面よけ（架電画面用・Mac 版）
-- -----------------------------------------------------------------------------
-- Windows 版（zoom-window-guard-1.1.4.ahk）と同じことを、Mac の Hammerspoon で行う。
-- 発信（zoomphonecall://）のたびに Zoom が前に出て、架電画面（ブラウザ）に重なる。
-- Zoom にはこれを止める設定が無い（2026-10-02 調査）。
-- そこで、発信の直後に前に出た Zoom を隠し（Command+H と同じ）、ブラウザを前に戻す。
--
-- 置き場は ~/.hammerspoon/zoom-window-guard.lua。~/.hammerspoon/init.lua の require で読み込む。
-- 入れるのは zoom-window-guard-mac.sh（ターミナルに1行貼るだけ）。
--
-- ⚠️ 1.1.0（2026-10-08）：1.0.0 は小松さんの Mac で「まだ出てくる」。直したこと：
--    ・画面ごとの合図（hs.window.filter）だけに頼らず、Zoom が前に出た合図（hs.application.watcher）で隠す。
--      画面ごとの合図は取りこぼしがあり、Mac では1枚ずつ最小化するより Zoom ごと隠す方が確実。
--    ・クリックした先の見分けを、画面の並び順（hs.window.orderedWindows）で見る。1.0.0 の見分け方
--      （アクセシビリティの要素）は、見分けられないと「人が Zoom を開いた」扱いになり、隠さなかった。
--    ・発信の直後とみなす時間を6秒→10秒に（Mac は「zoom.usを開きますか」の確認を挟むことがある）。
--    ・記録を詳しくし、メニューバーの「Z」から記録をコピーできるようにした（Slack に貼ってもらう）。
--
-- ⚠️ 対象は「ブラウザで操作した直後（10秒以内）に前に出た Zoom」と、隠した後の通話の間（90秒以内）に
--    また前に出た Zoom だけ。
-- ⚠️ ミーティング・ウェビナーの画面があるときは隠さない（ブラウザの招待リンクから入った直後に消えると困る）。
-- ⚠️ 人が自分で Zoom を開いたとき（Dock・Command+Tab・Zoom の画面をクリック）は、次にブラウザで操作するまで隠さない。
-- ⚠️ Control+Option+Z で一時停止・再開。メニューバーの「Z」からも止められる。
-- ⚠️ 何をしたかは ~/Library/Logs/ZoomWindowGuard/zoom-window-guard.log に1行ずつ残す。
-- ⚠️ 版（VERSION）は配布ファイルの名前と起動時の記録に使う。中身を変えたら上げる。

local VERSION = "1.1.0"

local M = {}

local ZOOM_BUNDLE = "us.zoom.xos"
local BROWSERS = {
  ["com.google.Chrome"] = true,
  ["com.microsoft.edgemac"] = true,
  ["org.mozilla.firefox"] = true,
  ["com.brave.Browser"] = true,
  ["com.apple.Safari"] = true,
  ["company.thebrowser.Browser"] = true,   -- Arc
}
local BROWSER_NAMES = { ["Phalanx"] = true }   -- PC版のPhalanx

local DIAL_WINDOW = 10      -- 発信の直後とみなす秒数
local CALL_WINDOW = 90      -- 隠した後、また前に出たら隠し直す秒数（通話の間）

local logDir = os.getenv("HOME") .. "/Library/Logs/ZoomWindowGuard"
local logFile = logDir .. "/zoom-window-guard.log"

local paused = false
local lastClick = 0             -- 最後にマウスを押した時刻（秒）
local lastClickOn = "なし"      -- 押した先（ブラウザ・Zoom・その他・不明）
local lastBrowserInput = 0      -- ブラウザで最後に操作した時刻
local lastSwitch = 0            -- 最後に Command+Tab で切り替えた時刻
local cmdTabbing = false
local lastBrowserApp = nil
local hiddenAt = 0              -- 最後に Zoom を隠した時刻
local releasedAt = 0            -- 人が Zoom を開いた時刻（次にブラウザで操作するまで隠さない）
local busy = false              -- 隠している最中（隠すことで起きる合図を拾わない）

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

local function isZoomApp(app)
  return app ~= nil and app:bundleID() == ZOOM_BUNDLE
end

-- クリックした位置の一番手前の画面が、どのアプリのものか。
local function appAt(pos)
  local ok, wins = pcall(hs.window.orderedWindows)
  if not ok or not wins then return nil end
  for _, w in ipairs(wins) do
    local f = w:frame()
    if pos.x >= f.x and pos.x <= f.x + f.w and pos.y >= f.y and pos.y <= f.y + f.h then
      return w:application()
    end
  end
  return nil
end

local function noteBrowser(app)
  lastBrowserInput = now()
  lastBrowserApp = app
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
    local app = appAt(e:location())
    if isBrowserApp(app) then
      lastClickOn = "ブラウザ"
      if t == types.leftMouseDown then noteBrowser(app) end
    elseif isZoomApp(app) then
      lastClickOn = "Zoom"
    elseif app then
      lastClickOn = "その他（" .. (app:name() or "?") .. "）"
    else
      lastClickOn = "不明"   -- Dock・メニューバーなど、画面の無い場所
    end
  elseif t == types.keyDown then
    local code = e:getKeyCode()
    local flags = e:getFlags()
    if code == hs.keycodes.map["tab"] and flags.cmd then
      cmdTabbing = true
    elseif KEYS[code] == "any" or (KEYS[code] == "ctrl" and flags.ctrl) then
      local app = hs.application.frontmostApplication()
      if isBrowserApp(app) then noteBrowser(app) end
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
  if lastBrowserApp and lastBrowserApp:isRunning() then
    lastBrowserApp:activate()
    return
  end
  for _, app in ipairs(hs.application.runningApplications()) do
    if isBrowserApp(app) then
      app:activate()
      return
    end
  end
end

local function zoomWindowsText(app)
  local parts = {}
  for _, w in ipairs(app:allWindows()) do
    local f = w:frame()
    parts[#parts + 1] = string.format("[%s|%s|%dx%d]", w:title() or "", w:subrole() or "", math.floor(f.w), math.floor(f.h))
  end
  return table.concat(parts, " ")
end

local function hasMeeting(app)
  for _, w in ipairs(app:allWindows()) do
    local title = (w:title() or ""):lower()
    if title:find("ミーティング") or title:find("ウェビナー") or title:find("meeting") or title:find("webinar") then
      return true
    end
  end
  return false
end

-- source … 合図の種類（前に出た・画面が出た）。
local function handleZoom(app, source)
  if paused or busy or not app then return end
  local t = now()
  local since = t - lastBrowserInput
  local info = string.format("合図=%s ブラウザ操作から%.1f秒 直前のクリック=%s（%.1f秒前）", source, since, lastClickOn, t - lastClick)

  -- 人がクリック・Dock・Command+Tab で Zoom を開いたときは、次にブラウザで操作するまで隠さない。
  if (t - lastClick < 0.7 and lastClickOn ~= "ブラウザ") or t - lastSwitch < 0.8 then
    releasedAt = t
    log("人が開いた（次にブラウザで操作するまで隠さない） " .. info)
    return
  end
  if releasedAt > lastBrowserInput then
    log("見送り（人が開いた後・まだブラウザで操作していない） " .. info)
    return
  end
  local isDial = since < DIAL_WINDOW
  -- ⚠️ 通話中に架電画面を操作しても（メモ・ステータス）、つながったときの再表示は隠し続ける。
  local inCall = hiddenAt > 0 and t - hiddenAt < CALL_WINDOW
  if not (isDial or inCall) then
    log("対象外（発信の直後ではない） " .. info)
    return
  end
  if hasMeeting(app) then
    log("ミーティング中（隠さない） " .. info .. " 画面=" .. zoomWindowsText(app))
    return
  end
  busy = true
  app:hide()
  hiddenAt = t
  log("隠した " .. info .. (isDial and "（発信の直後）" or "（通話の間の再表示）") .. " 画面=" .. zoomWindowsText(app))
  hs.timer.doAfter(0.05, function()
    focusBrowser()
    hs.timer.doAfter(0.3, function() busy = false end)
  end)
end

local function safe(fn, ...)
  local ok, err = pcall(fn, ...)
  if not ok then log("エラー " .. tostring(err)) end
end

local function setPaused(p)
  paused = p
  if M.menu then M.menu:setTitle(paused and "Z⏸" or "Z") end
  notify(paused and "一時停止しました。Control+Option+Z で再開します。" or "再開しました。")
  log(paused and "一時停止" or "再開")
end

-- 記録の最後の150行をコピーする（Slack に貼ってもらう）。
local function copyLog()
  local f = io.open(logFile, "r")
  if not f then notify("記録がまだありません。") return end
  local lines = {}
  for line in f:lines() do lines[#lines + 1] = line end
  f:close()
  local from = math.max(1, #lines - 149)
  hs.pasteboard.setContents(table.concat(lines, "\n", from, #lines))
  notify("記録をコピーしました。Slack に貼り付けてください。")
end

local function start()
  -- Zoom が前に出た（アプリが切り替わった・隠していたのが戻った）。
  M.appWatcher = hs.application.watcher.new(function(_, event, app)
    if not isZoomApp(app) then return end
    if event == hs.application.watcher.activated then
      hs.timer.doAfter(0.05, function() safe(handleZoom, app, "前に出た") end)
    elseif event == hs.application.watcher.unhidden then
      hs.timer.doAfter(0.05, function() safe(handleZoom, app, "隠したのが戻った") end)
    end
  end)
  M.appWatcher:start()
  -- Zoom が前に出ないまま、通話の画面だけが浮いて出る場合に備える。
  M.filter = hs.window.filter.new(false):setAppFilter("zoom.us", { allowRoles = "*" })
  M.filter:subscribe({ hs.window.filter.windowCreated, hs.window.filter.windowVisible }, function(win)
    hs.timer.doAfter(0.1, function()
      local app = win and win:application()
      if app and not app:isHidden() and hs.application.frontmostApplication() ~= app then
        safe(handleZoom, app, "画面が出た（" .. (win:title() or "") .. "）")
      end
    end)
  end)
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
      { title = "記録をコピー（Slackに貼る用）", fn = copyLog },
      { title = "記録を開く", fn = function() hs.execute("open -a TextEdit " .. string.format("%q", logFile)) end },
    }
  end)
  log("起動 版 " .. VERSION .. "（macOS " .. hs.host.operatingSystemVersionString() .. "・アクセシビリティ許可あり）")
  notify("動いています。Control+Option+Z で一時停止できます。")
end

hs.autoLaunch(true)       -- Mac を起動するたびに自動で動く
hs.dockicon.hide()
hs.menuIcon(false)        -- Hammerspoon 自身のアイコンは出さない（「Z」だけ）

-- ⚠️ アクセシビリティの許可が無いと、Zoom を隠せず操作も聞き取れない。許可されるまで2秒ごとに見て、
--    許可されたら読み込み直す（許可の前に作った聞き取りは効かないため）。
if hs.accessibilityState(true) then
  start()
else
  log("アクセシビリティの許可待ち 版 " .. VERSION)
  notify("「システム設定 → プライバシーとセキュリティ → アクセシビリティ」で Hammerspoon をオンにしてください。")
  M.menu = hs.menubar.new()
  M.menu:setTitle("Z！")
  M.menu:setTooltip("Zoomの画面よけ：アクセシビリティの許可待ち")
  M.waitAccess = hs.timer.doEvery(2, function()
    if hs.accessibilityState(false) then
      M.waitAccess:stop()
      hs.reload()
    end
  end)
end

_G.zoomWindowGuard = M   -- 消されないように持っておく（Hammerspoon の決まり）
return M
