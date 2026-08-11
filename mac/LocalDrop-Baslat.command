#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_APP="$HOME/Applications/LocalDrop.app"

if [ -d "$INSTALL_APP" ]; then
  open "$INSTALL_APP"
else
  echo "LocalDrop henüz kurulmamış. Kurulum başlatılıyor..."
  /bin/bash "$SCRIPT_DIR/Kurulum.command"
fi
