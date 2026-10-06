#!/usr/bin/env bash
# Nightly backup of the Medusa database and the uploaded product images.
#
# Writes to /var/backups/bitcoin-gym-kiosk on the VM's own disk and keeps 14 days.
# That alone doesn't survive losing the VM: the off-VM copy comes from the
# GCP snapshot schedule on the boot disk, which picks these files up. A
# pg_dump is used rather than relying on the snapshot alone because a
# snapshot of a running Postgres is only crash-consistent; the dump is a
# clean, restorable copy. See CLAUDE.md's "Database backups".
#
# Installed as /usr/local/sbin/bitcoin-gym-kiosk-backup, run as root by
# bitcoin-gym-kiosk-backup.timer.
set -euo pipefail

BACKUP_DIR=/var/backups/bitcoin-gym-kiosk
STATIC_DIR=/home/claude/bitcoin-gym-kiosk/backend/apps/backend/.medusa/server/static
KEEP_DAYS=14
stamp=$(date -u +%Y-%m-%dT%H%MZ)

install -d -m 700 "$BACKUP_DIR"
umask 077

# Write to a temp name first so a failed run never leaves a truncated file
# that looks like a good backup.
runuser -u postgres -- pg_dump --format=custom bitcoin_gym_kiosk > "$BACKUP_DIR/bitcoin-gym-kiosk-$stamp.dump.tmp"
mv "$BACKUP_DIR/bitcoin-gym-kiosk-$stamp.dump.tmp" "$BACKUP_DIR/bitcoin-gym-kiosk-$stamp.dump"

if [ -d "$STATIC_DIR" ]; then
  tar -czf "$BACKUP_DIR/static-$stamp.tar.gz.tmp" -C "$(dirname "$STATIC_DIR")" static
  mv "$BACKUP_DIR/static-$stamp.tar.gz.tmp" "$BACKUP_DIR/static-$stamp.tar.gz"
fi

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.dump' -o -name 'static-*.tar.gz' -o -name '*.tmp' \) -mtime +"$KEEP_DAYS" -delete

echo "Backup done: $BACKUP_DIR/bitcoin-gym-kiosk-$stamp.dump ($(du -h "$BACKUP_DIR/bitcoin-gym-kiosk-$stamp.dump" | cut -f1))"
