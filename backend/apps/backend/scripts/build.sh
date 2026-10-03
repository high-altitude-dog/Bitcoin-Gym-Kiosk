#!/usr/bin/env bash
# Wraps `medusa build` so the things that live in .medusa/server but aren't
# actually build output - the .env copy and anything uploaded through the
# admin while the server was running - survive it.
#
# Why this exists: `medusa build` deletes and recreates .medusa/server from
# scratch on every run (it's a fully standalone deployable app, decoupled
# from the source tree). That's correct for build artifacts, but .env and
# static/ (where the file-local provider writes uploads by default) end up
# living in that same folder for reasons that have nothing to do with the
# build, and get wiped along with it. See CLAUDE.md's "Building and running
# Medusa in production" notes for the full story.
#
# Usage: from backend/apps/backend, run `./scripts/build.sh`.
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER_DIR=".medusa/server"
BACKUP_DIR=".medusa/.build-backup"

mkdir -p "$BACKUP_DIR"

if [ -d "$SERVER_DIR/static" ]; then
  echo "Backing up $SERVER_DIR/static..."
  rm -rf "$BACKUP_DIR/static"
  cp -a "$SERVER_DIR/static" "$BACKUP_DIR/static"
fi

if [ -f "$SERVER_DIR/.env" ]; then
  cp "$SERVER_DIR/.env" "$BACKUP_DIR/.env"
fi

echo "Running medusa build..."
npx medusa build

echo "Restoring .env..."
if [ -f "$BACKUP_DIR/.env" ]; then
  cp "$BACKUP_DIR/.env" "$SERVER_DIR/.env"
elif [ -f ".env" ]; then
  # First build ever: nothing to restore yet, so bootstrap from the source
  # tree's own .env (on the VM this already holds the real production
  # secrets set up during the initial deploy, not local dev's placeholders).
  echo "No previous $SERVER_DIR/.env found; copying this app's own .env instead."
  cp ".env" "$SERVER_DIR/.env"
else
  echo "WARNING: no .env found anywhere to copy into $SERVER_DIR. The server will fail to start without one." >&2
fi

if [ -d "$BACKUP_DIR/static" ]; then
  echo "Restoring uploaded files..."
  mkdir -p "$SERVER_DIR/static"
  cp -a "$BACKUP_DIR/static/." "$SERVER_DIR/static/"
fi

echo "Installing server dependencies..."
(cd "$SERVER_DIR" && npm install)

echo "Build complete. $SERVER_DIR is ready to run (npx medusa start, from inside that folder)."
