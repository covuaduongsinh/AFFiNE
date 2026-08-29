#!/bin/sh
# Nightly cold backup of the sync server's data directory to Google Drive or
# Dropbox via rclone. Docker/Dokploy variant of backup-chess-sync.sh.
#
# Cold, not hot: PGlite runs inside the server process and only flushes on
# close, so copying a live data directory can capture a torn page — a backup
# that looks fine right up until the restore. The stop costs a few seconds on a
# small database, and the clients are local-first, so a gap at 03:15 is
# invisible.
#
# Set up the remote once with `rclone config`, wrapping it in a `crypt` remote:
# this archive holds the JWT signing key and every password hash, so Google
# should be holding ciphertext.
set -eu

# Dokploy appends a random suffix when it creates the service, so this is not
# simply "affine". Take it from the compose.create response, or:
#   docker compose ls | grep affine
APP_NAME="${APP_NAME:?set APP_NAME to the Dokploy-generated compose project name}"
PROJECT_DIR="/etc/dokploy/compose/$APP_NAME/code"

# A plain host bind mount, not a Docker volume, which is why this is a normal
# tar of a normal path.
DATA_PARENT=/etc/dokploy/affine
DATA_NAME=data
DEST=/var/backups/chess-sync
REMOTE=gcrypt:daily
KEEP_LOCAL_DAYS=7
KEEP_REMOTE_DAYS=60

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DEST/chess-sync-$STAMP.tar.zst"
mkdir -p "$DEST"

compose() {
	docker compose -p "$APP_NAME" --project-directory "$PROJECT_DIR" \
		-f "$PROJECT_DIR/docker-compose.yml" "$@"
}

# If tar or rclone dies, the server must still come back. Without this trap a
# failed backup at 03:15 means a server that stays down until someone notices.
trap 'compose start sync || true' EXIT

# `docker compose stop`, never `docker stop`: only compose honours
# stop_grace_period. Plain `docker stop` uses its own 10s default, which races
# the 10s force-exit inside cli.ts and can SIGKILL PGlite mid-flush — producing
# exactly the torn archive this script exists to avoid.
compose stop sync

# Confirm it really stopped before reading the directory. A backup taken from
# under a still-running PGlite is the failure mode with no symptom.
i=0
while [ "$i" -lt 10 ]; do
	running=$(compose ps -q sync 2>/dev/null | xargs -r docker inspect -f '{{.State.Running}}' 2>/dev/null | grep -c true || true)
	[ "$running" = "0" ] && break
	i=$((i + 1))
	sleep 3
done

tar -I 'zstd -12' -cf "$OUT" -C "$DATA_PARENT" "$DATA_NAME"
compose start sync
trap - EXIT

# Verify the archive before trusting it enough to delete an older one.
zstd -t "$OUT"
sha256sum "$OUT" > "$OUT.sha256"

# The remote needs `rclone config`, which needs a browser sign-in, so it may
# not exist yet. A local cold copy is still worth having every night, and a job
# that fails on a missing remote would just train you to ignore the failures.
if rclone listremotes 2>/dev/null | grep -q "^${REMOTE%%:*}:"; then
	rclone copy "$OUT" "$REMOTE/" --immutable
	rclone copy "$OUT.sha256" "$REMOTE/" --immutable
	rclone delete --min-age "${KEEP_REMOTE_DAYS}d" "$REMOTE/"
	echo "uploaded to $REMOTE"
else
	echo "warning: rclone remote '${REMOTE%%:*}' is not configured — kept the local copy only." >&2
	echo "         run: rclone config   (create a storage remote, then a 'crypt' remote wrapping it)" >&2
fi

find "$DEST" -name 'chess-sync-*.tar.zst*' -mtime "+$KEEP_LOCAL_DAYS" -delete

echo "backed up $OUT"
