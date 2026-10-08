# Installation

mr-review runs as a Docker container — no Python or Node.js required on your machine.

## Prerequisites

- **Docker Desktop** — [Windows / macOS](https://www.docker.com/products/docker-desktop/)
- **Docker Engine + Compose plugin** — [Linux install guide](https://docs.docker.com/engine/install/)

That's the only requirement.

## Quick start (all-in-one)

Single container, everything on one port. Good for trying it out.

The all-in-one image is built for `linux/amd64` only, so on Apple Silicon it runs under
emulation — use the standard deployment below if that matters; its two images are built for
`arm64` as well.

```bash
# 1. Create a working directory
mkdir mr-review && cd mr-review

# 2. Download compose file
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/all-in-one/docker-compose.yml

# 3. Start
docker compose up -d

# 4. Open the app
#    http://localhost:17240
```

Data is stored in `./data` next to the compose file. The port is published on `127.0.0.1`
only, so the app is reachable from this machine and nowhere else — see
[Opening it from another machine](#opening-it-from-another-machine) before changing that.

### One-liner (no compose file)

If you just want to try it without downloading anything:

```bash
docker run -d \
  --name mr-review \
  -p 127.0.0.1:17240:8000 \
  -v "$HOME/mr-review-data:/data" \
  -e MR_REVIEW__SERVER__HOST=0.0.0.0 \
  -e MR_REVIEW__SERVER__PORT=8000 \
  -e MR_REVIEW__DATA_DIR=/data \
  -e MR_REVIEW__HOST_DATA_DIR="$HOME/mr-review-data" \
  ghcr.io/bedrock-python/mr-review/all-in-one:latest
```

On Windows (PowerShell):

```powershell
docker run -d `
  --name mr-review `
  -p 127.0.0.1:17240:8000 `
  -v "$env:USERPROFILE\mr-review-data:/data" `
  -e MR_REVIEW__SERVER__HOST=0.0.0.0 `
  -e MR_REVIEW__SERVER__PORT=8000 `
  -e MR_REVIEW__DATA_DIR=/data `
  -e "MR_REVIEW__HOST_DATA_DIR=$env:USERPROFILE\mr-review-data" `
  ghcr.io/bedrock-python/mr-review/all-in-one:latest
```

Open http://localhost:17240. To stop: `docker stop mr-review && docker rm mr-review`.

## Standard deployment (recommended)

Two containers: the web UI on port 17242 and the API behind it. The UI's nginx forwards
`/api/` to the API container, so the browser only ever talks to port 17242 and the UI works
under any hostname or address you open it by. The API is also published on 17241 for
scripts and its OpenAPI page (`/system/docs`). Allows independent updates and more control.

```bash
mkdir mr-review && cd mr-review
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/standard/docker-compose.yml

# Optional: customize ports or data directory
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/standard/.env.example
cp .env.example .env
# edit .env if needed

docker compose up -d
# UI:  http://localhost:17242
# API: http://localhost:17241/system/docs
```

## Opening it from another machine

Both compose files publish their ports on `127.0.0.1`. That is deliberate: **mr-review has
no login.** Anyone who can open the port can read every stored VCS token and AI API key
(`POST /api/v1/data/export`) and post comments under your tokens. Publish it beyond this
machine only on a network where you trust everyone who can reach it, or put a reverse
proxy that authenticates in front of it instead.

To publish on every interface, set `MR_REVIEW_BIND` in the `.env` next to the compose file:

```env
MR_REVIEW_BIND=0.0.0.0
```

Or a single address, such as the machine's LAN IP, to publish on that interface only. For
`docker run`, drop the `127.0.0.1:` prefix from `-p` (or give it that address).

Inside the container the server always listens on `0.0.0.0`; only the published port
decides who can reach it.

The API also answers only the host names it knows — `localhost`, `127.0.0.1`, `::1` and
the compose service name `api` — and refuses any other with `400 Invalid host header`,
naming it. So publishing the port is not enough: add the address or name the other machines
use to `MR_REVIEW__ALLOWED_HOSTS` on the API container (all-in-one: the only container),
for example:

```yaml
environment:
  MR_REVIEW__ALLOWED_HOSTS: "localhost,192.168.1.10"
```

See [Host names](configuration.md#host-names) for proxies and wildcards.

## Updating

```bash
docker compose pull
docker compose up -d
```

### Upgrading from api 0.2.1 / web-app 0.2.2 or earlier

Four things changed that an existing installation can notice. Each one, with what it
looks like and how to get the old behaviour back:

1. **The ports are published on `127.0.0.1`.** Once you take the new compose file, a
   deployment you opened from another machine stops answering there. To publish it on the
   network again, set `MR_REVIEW_BIND=0.0.0.0` in `.env` — after reading
   [the warning](#opening-it-from-another-machine).
2. **The web-app image calls the API on its own origin.** Its `API_BASE_URL` used to
   default to `http://localhost:8000`; now it is empty, and nginx in the container forwards
   `/api/` to `API_UPSTREAM` (`http://api:8000`). The shipped standard compose file is
   updated for this. A web-app container run on its own next to an API on the host's port
   8000 now answers `/api/` with 502. Either point the browser back at that API with
   `-e API_BASE_URL=http://localhost:8000`, as before (the API's
   `MR_REVIEW__CORS__ALLOW_ORIGINS` must still list the UI's origin), or keep the
   same-origin setup and point the proxy at it with
   `-e API_UPSTREAM=http://host.docker.internal:8000` (on Linux, also
   `--add-host=host.docker.internal:host-gateway`).
3. **The API containers start as root and drop to `1000:1000`.** Older images ran as a
   system user (uid 100); the first start gives the existing data directory to `1000:1000`
   (or `PUID:PGID`) by itself. Two setups need a change — see
   [File ownership](#file-ownership): a container run with `cap_drop: [ALL]` stops with a
   message until it gets `cap_add: [CHOWN, SETUID, SETGID]` or runs as `user: "1000:1000"`,
   and one run with `user:` needs every file in the directory to belong to that user.
4. **No HSTS header by default.** The web-app image used to send
   `Strict-Transport-Security` with `includeSubDomains` whenever `APP_ENV` was
   `production`, which is its default. HSTS belongs to whatever terminates TLS in front of
   it; to send it from this container anyway, set `HSTS_MAX_AGE=31536000` on the `web`
   service, and `HSTS_INCLUDE_SUBDOMAINS=true` only if every subdomain is HTTPS as well.

## Stopping

```bash
docker compose down
```

## Data persistence

All application data — `hosts.yaml`, `ai_providers.yaml` and one YAML file per review — is stored in `DATA_DIR`, which defaults to `./data` relative to the compose file. There is no database. The directory is mounted as a volume, so data survives container restarts and image updates. It holds host tokens and provider API keys in plain text, so keep it private.

To use a different location, set `DATA_DIR` in your `.env` file:

```env
DATA_DIR=/opt/mr-review/data
```

### File ownership

The API and all-in-one containers start as root only long enough to hand the data
directory to the user the application runs as, then drop to that user — the application
itself never runs as root. That user is `1000:1000` unless `PUID` and `PGID` say otherwise;
set them to your own IDs to keep the files owned by you on the host:

```env
# the output of `id -u` and `id -g`
PUID=1000
PGID=1000
```

This is what makes a fresh install work on Linux, where Docker creates a missing `./data`
owned by root. Files the application writes are readable by that user only (mode `600`).

If you start the container as a non-root user yourself — `user:` in the compose file,
`--user` with `docker run`, `runAsUser` in Kubernetes — it changes no ownership, and stops
with a message naming the fix if anything in the data directory is not readable and
writable by that user:

```bash
sudo chown -R 1000:1000 ./data   # the uid:gid the container runs as
```

Fixing the ownership and dropping to the user need the `CHOWN`, `SETUID` and `SETGID`
capabilities, which Docker grants by default. A hardened compose file that drops them all
has to add those three back, or start the container as the user instead:

```yaml
services:
  mr-review:
    cap_drop: [ALL]
    cap_add: [CHOWN, SETUID, SETGID]   # or, in place of this line: user: "1000:1000"
```

Without `SETUID`/`SETGID` the container stops with a message rather than run the
application as root. Without only `CHOWN` it skips the ownership fix and starts if the
directory already belongs to `PUID:PGID`.

**Rootless Docker or Podman** maps the container's root to your own user on the host, and
uid 1000 inside to some subordinate uid you cannot edit files as. There, `PUID=0` and
`PGID=0` are what keep the data directory owned by you — the application still has no
more rights on the host than your own account.

## For developers

If you want to run the services without Docker (for local development), see the README files in the repository:

- `services/mr-review/README.md` — Python backend
- `services/web-app/README.md` — React frontend
