#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

say() { printf '%s\n' "$*"; }
fail() { say "Error: $*"; exit 1; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This app runs on macOS only."
fi

command -v python3 >/dev/null || fail "python3 is missing. Install it from https://www.python.org/ or Xcode Command Line Tools."

for file in three.module.js OBJLoader.js MTLLoader.js OrbitControls.js; do
  [[ -f "$ROOT/web/static/vendor/$file" ]] || fail "Missing $file in web/static/vendor. Re-clone the repository."
done

find_brew() {
  if command -v brew >/dev/null; then
    command -v brew
    return
  fi
  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  return 1
}

use_brew() {
  local brew_bin
  brew_bin="$(find_brew)" || return 1
  eval "$("$brew_bin" shellenv)"
}

if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  say "ffmpeg is missing."
  if ! use_brew; then
    say "Homebrew is missing. Installing it (you may be asked for your Mac password)…"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    use_brew || fail "Homebrew installed, but it is not on PATH. Open a new terminal and run this script again."
  fi
  say "Installing ffmpeg with Homebrew…"
  brew install ffmpeg
  command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || fail "ffmpeg is still missing after install."
fi

if ! command -v swift >/dev/null; then
  say "Swift is missing. Opening the Xcode Command Line Tools installer…"
  xcode-select --install 2>/dev/null || true
  fail "Finish the installer, then run this script again."
fi

say "Checking Object Capture on this Mac…"
limits_out="$(swift "$ROOT/scripts/ObjectCaptureLimits.swift" 2>/dev/null | tail -1)" || {
  fail "Could not query Object Capture. You need Apple Silicon, a recent macOS, and working Swift tools."
}
if [[ "$limits_out" != *'"supported":true'* && "$limits_out" != *'"supported": true'* ]]; then
  fail "Object Capture is not supported on this Mac. That is an Apple hardware/macOS feature and cannot be installed."
fi

exec python3 -u "$ROOT/web/server.py" --open "$@"
