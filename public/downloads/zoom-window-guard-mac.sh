#!/bin/bash
# Zoom の画面よけ（Mac 版）を入れる。ターミナルに次の1行を貼って Enter：
#   curl -fsSL https://spanavi.jp/downloads/zoom-window-guard-mac.sh | bash
#
# 1. Hammerspoon（無料・Windows の AutoHotkey にあたる道具）が無ければ、公式の GitHub から入れる
# 2. ~/.hammerspoon/zoom-window-guard.lua に本体を置き、init.lua から読み込ませる（ほかの設定は消さない）
# 3. Hammerspoon を起動し直し、アクセシビリティの設定画面を開く（許可は本人が手でオンにする。Apple の決まり）
#
# ⚠️ この名前は版を入れずに固定する（マイページに出す1行を変えないため）。本体の版は下の VERSION で上げる。
# ⚠️ 何度実行しても同じ結果になる（入れ直し・版の更新もこの1行）。

set -euo pipefail

VERSION="1.1.0"
BASE="https://spanavi.jp/downloads"
HS_DIR="$HOME/.hammerspoon"

echo "Zoomの画面よけ（Mac）版 $VERSION を入れます。"

app=""
for d in /Applications "$HOME/Applications"; do
  if [ -d "$d/Hammerspoon.app" ]; then app="$d/Hammerspoon.app"; fi
done

if [ -z "$app" ]; then
  echo "Hammerspoon を入れています…"
  url=$(curl -fsSL https://api.github.com/repos/Hammerspoon/hammerspoon/releases/latest \
    | grep -o '"browser_download_url": *"[^"]*\.zip"' | head -1 | sed -E 's/.*"(https[^"]*)"/\1/')
  if [ -z "$url" ]; then
    echo "Hammerspoon の置き場が見つかりませんでした。時間をおいて、もう一度実行してください。"
    exit 1
  fi
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/hammerspoon.zip" "$url"
  ditto -x -k "$tmp/hammerspoon.zip" "$tmp"
  if [ -w /Applications ]; then dest=/Applications; else mkdir -p "$HOME/Applications"; dest="$HOME/Applications"; fi
  mv "$tmp/Hammerspoon.app" "$dest/"
  rm -rf "$tmp"
  app="$dest/Hammerspoon.app"
fi

mkdir -p "$HS_DIR"
curl -fsSL -o "$HS_DIR/zoom-window-guard.lua" "$BASE/zoom-window-guard-mac-$VERSION.lua"
touch "$HS_DIR/init.lua"
if ! grep -q 'require("zoom-window-guard")' "$HS_DIR/init.lua"; then
  printf '\nrequire("zoom-window-guard")\n' >> "$HS_DIR/init.lua"
fi

# 動いている Hammerspoon は止めてから起動し直す（新しい版を読ませる）。
osascript -e 'quit app "Hammerspoon"' >/dev/null 2>&1 || true
sleep 1
open "$app"
sleep 2
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"

echo ""
echo "あと1つです。開いた「アクセシビリティ」の画面で、Hammerspoon をオンにしてください。"
echo "画面の右上のメニューバーに「Z」が出れば完了です。Macを起動するたびに、自動で動きます。"
