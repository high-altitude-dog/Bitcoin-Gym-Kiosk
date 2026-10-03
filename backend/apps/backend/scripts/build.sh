#!/usr/bin/env bash
# Wraps `medusa build` so the things that live in .medusa/server but aren't
# actually build output survive it: the .env copy, anything uploaded through
# the admin while the server was running, and product images uploaded from
# the source tree by create-armor-gym-products.ts.
#
# Why this exists: `medusa build` deletes and recreates .medusa/server from
# scratch on every run (it's a fully standalone deployable app, decoupled
# from the source tree). That's correct for build artifacts, but .env and
# static/ (where the file-local provider writes uploads, relative to
# whichever folder the process runs from) end up living in that same folder
# for reasons that have nothing to do with the build, and get wiped along
# with it. See CLAUDE.md's "Building and running Medusa in production".
#
# This app's own .env is the source of truth: edit that one, never
# .medusa/server/.env. Every build copies it in fresh.
#
# Usage: from backend/apps/backend, run `./scripts/build.sh`.
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER_DIR=".medusa/server"
BACKUP_DIR=".medusa/.build-backup"

# Checked before building: `medusa build` wipes $SERVER_DIR, so finding out
# afterwards would leave a server with no config at all.
if [ ! -f ".env" ]; then
  echo "ERROR: $(pwd)/.env not found. It's the source of the server's config; nothing was built." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

if [ -d "$SERVER_DIR/static" ]; then
  echo "Backing up uploaded files from $SERVER_DIR/static..."
  rm -rf "$BACKUP_DIR/static"
  cp -a "$SERVER_DIR/static" "$BACKUP_DIR/static"
fi

rm -f "$BACKUP_DIR/.env.previous"
if [ -f "$SERVER_DIR/.env" ]; then
  cp -p "$SERVER_DIR/.env" "$BACKUP_DIR/.env.previous"
fi

echo "Running medusa build..."
npx medusa build

echo "Copying .env into $SERVER_DIR..."
cp -p ".env" "$SERVER_DIR/.env"
if [ -f "$BACKUP_DIR/.env.previous" ] && ! cmp -s "$BACKUP_DIR/.env.previous" "$SERVER_DIR/.env"; then
  # Names only: values are secrets and this output may end up in a log.
  changed=$( { diff <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$BACKUP_DIR/.env.previous" | sort) \
                    <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$SERVER_DIR/.env" | sort) || true; } \
             | sed -nE 's/^[<>] ([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p' | sort -u | tr '\n' ' ')
  echo "NOTE: the server's .env changed since the last build. Variables added, removed or changed: ${changed:-none (comments/whitespace only)}"
  echo "      The previous copy is kept at $BACKUP_DIR/.env.previous if you need to roll back."
fi

mkdir -p "$SERVER_DIR/static"
if [ -d "$BACKUP_DIR/static" ]; then
  echo "Restoring uploaded files..."
  cp -a "$BACKUP_DIR/static/." "$SERVER_DIR/static/"
fi
if [ -d "static" ]; then
  # Images uploaded by scripts run from this folder (create-armor-gym-
  # products.ts) land in ./static, but the server serves .medusa/server/static.
  # -n: never overwrite a file the running server already has.
  echo "Adding images uploaded from the source tree..."
  cp -an "static/." "$SERVER_DIR/static/"
fi

echo "Installing server dependencies..."
(cd "$SERVER_DIR" && npm install)

echo "Build complete. $SERVER_DIR is ready to run (npx medusa start, from inside that folder)."
