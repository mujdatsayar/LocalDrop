#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/kaynak"
OUTPUT_DIR="$SCRIPT_DIR/kurulum"
INSTALL_ROOT="$HOME/Applications"
INSTALL_APP="$INSTALL_ROOT/LocalDrop.app"

pause_on_error() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    echo
    echo "Kurulum tamamlanamadı (hata kodu: $exit_code)."
    echo "Yukarıdaki hata mesajını kontrol edin."
    read -r -p "Pencereyi kapatmak için Enter'a basın..." _
  fi
}
trap pause_on_error EXIT

echo "========================================"
echo " LocalDrop macOS kurulumu"
echo "========================================"
echo

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Bu kurulum yalnızca macOS üzerinde çalışır."
  exit 1
fi

if [ ! -f "$SOURCE_DIR/package.json" ]; then
  echo "Mac kaynak klasörü bulunamadı: $SOURCE_DIR"
  exit 1
fi

node_is_compatible() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'
}

if ! node_is_compatible; then
  echo "LocalDrop için Node.js 22.12 veya daha yeni bir sürüm gerekiyor."
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew kurulu değil. Resmi Homebrew kurulumunu başlatmak gerekiyor."
    read -r -p "Homebrew kurulsun mu? [E/h] " answer
    case "${answer:-E}" in
      E|e|Y|y)
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if [ -x /opt/homebrew/bin/brew ]; then
          eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [ -x /usr/local/bin/brew ]; then
          eval "$(/usr/local/bin/brew shellenv)"
        fi
        ;;
      *)
        echo "Homebrew kurulmadığı için işlem durduruldu."
        exit 1
        ;;
    esac
  fi

  echo "Node.js kuruluyor veya güncelleniyor..."
  if brew list node@22 >/dev/null 2>&1; then
    brew upgrade node@22 || true
  else
    brew install node@22
  fi
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi

if ! node_is_compatible; then
  echo "Uyumlu Node.js bulunamadı. Gereken sürüm: 22.12 veya üzeri."
  exit 1
fi

echo "Node.js: $(node --version)"
echo "İşlemci: $(uname -m)"
echo
echo "Bağımlılıklar kuruluyor..."
cd "$SOURCE_DIR"
npm ci

echo
echo "Testler çalıştırılıyor..."
npm test

echo
echo "Bu Mac'e uygun uygulama paketleri hazırlanıyor..."
npm run make:mac

BUILT_APP="$OUTPUT_DIR/LocalDrop.app"
if [ ! -d "$BUILT_APP" ]; then
  echo "Uygulama paketi bulunamadı: $BUILT_APP"
  exit 1
fi

mkdir -p "$INSTALL_ROOT"
if [ -e "$INSTALL_APP" ]; then
  TRASH_APP="$HOME/.Trash/LocalDrop-eski-$(date +%Y%m%d-%H%M%S).app"
  echo "Önceki sürüm Çöp Sepeti'ne taşınıyor: $TRASH_APP"
  mv "$INSTALL_APP" "$TRASH_APP"
fi

echo "LocalDrop kullanıcının Uygulamalar klasörüne kuruluyor..."
ditto "$BUILT_APP" "$INSTALL_APP"
xattr -dr com.apple.quarantine "$INSTALL_APP" 2>/dev/null || true

echo
echo "Kurulum tamamlandı."
echo "Uygulama: $INSTALL_APP"
echo "Paketler: $OUTPUT_DIR"
echo "Aktarım dosyaları: $HOME/Documents/LocalDrop/files"
echo
open "$INSTALL_APP"
trap - EXIT
read -r -p "Bu pencereyi kapatmak için Enter'a basın..." _
