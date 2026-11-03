#!/bin/sh
# Starts Bit Cycler on a Mac: serves the game folder with Python's own web server
# and opens it in your browser. Close the Terminal window that opens to stop the game.
# (If the Mac has no Python yet, it offers to install Apple's Command Line Tools: accept, then run this again.)
cd "$(dirname "$0")" || exit 1
printf '\033]0;Bit Cycler\007'
if ! python3 tools/serve-mac.py; then
  echo 'Press Return to close.'
  read -r _
fi
