#!/bin/sh
# Entrypoint of the api and all-in-one images.
#
# Started as root (the default), it hands the data directory to PUID:PGID
# (1000:1000 unless set) and re-executes itself as that user, so the
# application never runs as root. This is what lets a bind mount work on
# Linux when Docker created the host directory itself, owned by root.
#
# Started as any other user (compose `user:`, Kubernetes runAsUser), it
# changes no ownership, and stops with a message naming the fix when the data
# directory is not writable — instead of the first save failing with a
# PermissionError.
set -eu

data_dir="${MR_REVIEW__DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ] && [ "${PUID:-1000}" != "0" ]; then
    uid="${PUID:-1000}"
    gid="${PGID:-1000}"
    case "$uid$gid" in
        *[!0-9]*)
            echo "mr-review: PUID and PGID must be numeric, got PUID=$uid PGID=$gid" >&2
            exit 1
            ;;
    esac

    mkdir -p "$data_dir"
    # Only entries that are not already uid:gid, so a restart does not rewrite
    # the whole store. Failing here (a root-squashed NFS export, say) is not
    # fatal: the writability check below decides.
    find "$data_dir" \( ! -user "$uid" -o ! -group "$gid" \) -exec chown -h "$uid:$gid" {} + ||
        echo "mr-review: could not give $data_dir to $uid:$gid" >&2

    export HOME=/home/app
    exec setpriv --reuid="$uid" --regid="$gid" --clear-groups -- "$0" "$@"
fi

if ! mkdir -p "$data_dir" 2>/dev/null || [ ! -w "$data_dir" ] ||
    [ -n "$(find "$data_dir" -type d ! -writable -print 2>/dev/null | head -n 1)" ]; then
    echo "mr-review: $data_dir (or a directory in it) is not writable by uid $(id -u), gid $(id -g)." >&2
    echo "  Either give the host directory to that user:  sudo chown -R $(id -u):$(id -g) <host directory>" >&2
    echo "  or start the container as root (no 'user:') and set PUID/PGID: it fixes the ownership itself." >&2
    exit 1
fi

# hosts.yaml and ai_providers.yaml hold tokens and API keys in plain text:
# whatever the application writes is readable by its own user only.
umask 077

exec "$@"
