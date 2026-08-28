#!/bin/sh
# Nightly cold backup of the sync server's data directory to Google Drive or
# Dropbox via rclone.
#
# Cold, not hot: PGlite runs inside the server process and only flushes on
# close, so copying a live data directory can capture a torn page — a backup
# that looks fine right up until the restore. The stop costs a few seconds on a
# 28 MB database, and the clients are local-first, so a gap at 03:15 is
# invisible.
#
# Set up the remote once with `rclone config`. Wrap it in a `crypt` remote:
# this archive contains the JWT signing key and every password hash, so Google
# should be holding ciphertext.
set -eu

DATA_PARENT=/var/lib
DATA_NAME=chess-sync
DEST=/var/backups/chess-sync
REMOTE=gcrypt:daily
KEEP_LOCAL_DAYS=7
KEEP_REMOTE_DAYS=60

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DEST/chess-sync-$STAMP.tar.zst"
mkdir -p "$DEST"

# If tar or rclone dies, the server must still come back. Without this trap a
# failed backup at 03:15 means a server that stays down until someone notices.
trap 'systemctl start chess-sync || true' EXIT

systemctl stop chess-sync
tar -I 'zstd -12' -cf "$OUT" -C "$DATA_PARENT" "$DATA_NAME"
systemctl start chess-sync
trap - EXIT

# Verify the archive before trusting it enough to delete an older one.
zstd -t "$OUT"
sha256sum "$OUT" > "$OUT.sha256"

rclone copy "$OUT" "$REMOTE/" --immutable
rclone copy "$OUT.sha256" "$REMOTE/" --immutable

find "$DEST" -name 'chess-sync-*.tar.zst*' -mtime "+$KEEP_LOCAL_DAYS" -delete
rclone delete --min-age "${KEEP_REMOTE_DAYS}d" "$REMOTE/"

echo "backed up $OUT"
