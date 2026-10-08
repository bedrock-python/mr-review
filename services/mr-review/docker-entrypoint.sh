#!/bin/sh
# Entrypoint of the api and all-in-one images.
#
# Started as root (the default), it hands the data directory to PUID:PGID
# (1000:1000 unless set) and re-executes itself as that user, so the
# application never runs as root. This is what lets a bind mount work on
# Linux when Docker created the host directory itself, owned by root. It
# needs the CHOWN, SETUID and SETGID capabilities, which Docker grants by
# default; without CHOWN it skips the ownership fix, without SETUID/SETGID it
# stops and says so rather than run the application as root.
#
# Started as any other user (compose `user:`, Kubernetes runAsUser), it
# changes no ownership, and stops with a message naming the fix when anything
# in the data directory is not readable and writable by that user — instead
# of the first request failing with a PermissionError.
set -eu

data_dir="${MR_REVIEW__DATA_DIR:-/data}"
data_dir="${data_dir%/}"

# Whether the effective capability set holds capability number $1. Reads
# /proc rather than trying the operation; assumes yes when /proc is not there.
has_cap() {
    cap_eff=$(sed -n 's/^CapEff:[[:space:]]*//p' /proc/self/status 2>/dev/null || true)
    [ -z "$cap_eff" ] || [ $(((0x$cap_eff >> $1) & 1)) -eq 1 ]
}
CAP_CHOWN=0
CAP_SETGID=6
CAP_SETUID=7

if [ "$(id -u)" = "0" ] && [ "${PUID:-1000}" != "0" ]; then
    uid="${PUID:-1000}"
    gid="${PGID:-1000}"
    case "$uid$gid" in
        *[!0-9]*)
            echo "mr-review: PUID and PGID must be numeric, got PUID=$uid PGID=$gid" >&2
            exit 1
            ;;
    esac

    if ! has_cap "$CAP_SETUID" || ! has_cap "$CAP_SETGID"; then
        echo "mr-review: started as root without the SETUID/SETGID capabilities (cap_drop?)," >&2
        echo "  so it cannot drop to $uid:$gid, and it will not run the application as root. Either:" >&2
        echo "  - keep cap_drop and add back what the start-up needs:  cap_add: [CHOWN, SETUID, SETGID]" >&2
        echo "  - or start it as the user directly:  user: \"$uid:$gid\"  (the data directory must then belong to it)" >&2
        exit 1
    fi

    mkdir -p "$data_dir" 2>/dev/null || true
    if has_cap "$CAP_CHOWN"; then
        # Only entries that are not already uid:gid, so a restart does not
        # rewrite the whole store; lost+found belongs to the filesystem. A
        # failure (a root-squashed NFS export, say) is left to the check that
        # runs as uid:gid below.
        find "$data_dir" -path "$data_dir/lost+found" -prune -o \
            \( ! -user "$uid" -o ! -group "$gid" \) -exec chown -h "$uid:$gid" {} + 2>/dev/null || true
    else
        echo "mr-review: no CHOWN capability, leaving the ownership of $data_dir as it is" >&2
    fi

    export HOME=/home/app
    exec setpriv --reuid="$uid" --regid="$gid" --clear-groups -- "$0" "$@"
fi

mkdir -p "$data_dir" 2>/dev/null || true
# The first entry this user cannot use: every directory needs rwx and every
# file rw, since a save replaces the file and a load reads it.
unusable=$(find "$data_dir" -path "$data_dir/lost+found" -prune -o \
    \( ! -readable -o ! -writable -o \( -type d ! -executable \) \) -print 2>/dev/null | head -n 1)
if [ ! -d "$data_dir" ] || [ -n "$unusable" ]; then
    echo "mr-review: ${unusable:-$data_dir} is not readable and writable by uid $(id -u), gid $(id -g)." >&2
    echo "  Either give the host directory to that user:  sudo chown -R $(id -u):$(id -g) <host directory>" >&2
    echo "  or start the container as root (no 'user:') with PUID/PGID set: it fixes the ownership itself" >&2
    echo "  (that needs the CHOWN, SETUID and SETGID capabilities, which Docker grants by default)." >&2
    exit 1
fi

# hosts.yaml and ai_providers.yaml hold tokens and API keys in plain text:
# whatever the application writes is readable by its own user only.
umask 077

exec "$@"
