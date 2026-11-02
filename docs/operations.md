# Operations

## Run with Docker Compose

```sh
cp .env.example .env             # set PUBLIC_URL, DOMAIN etc. as needed
docker compose up -d --build     # containers: mchango-app (and mchango-caddy with --profile https)
docker compose logs -f mchango
```

- Public page: <http://localhost:8080/>
- Management: <http://localhost:8081/manage> (sign-in required)
- All data (database and private uploads) lives in the `mchango-data` volume.

### Management accounts

Accounts are created on the server. The command asks for the password twice
without echoing it:

```sh
docker compose exec mchango mchango user add katuku
docker compose exec mchango mchango user list
docker compose exec mchango mchango user password katuku   # reset; signs out existing sessions
docker compose exec mchango mchango user remove katuku
```

Passwords need at least 10 characters. They are stored as Argon2id hashes.
After 5 failed sign-ins an account is locked for 15 minutes.

### HTTPS

Point a DNS name at the server, set `DOMAIN` in `.env`, then:

```sh
docker compose --profile https up -d
```

Caddy obtains certificates automatically and proxies **only the public
listener**.

### Managing from a phone

The management port is published on the server's loopback interface only.
Choose one of these:

1. **SSH tunnel** (laptop): `ssh -L 8081:127.0.0.1:8081 you@server`, then open
   <http://localhost:8081/manage>.
2. **VPN (recommended for phones)**, e.g. Tailscale: set `MANAGE_BIND` to the
   server's Tailscale IP and `MANAGE_ALLOWED_HOSTS` to that IP and/or the
   machine's Tailscale name, then `docker compose up -d`.
3. **HTTPS on a separate name** (sign-in protected, publicly reachable): set
   `ADMIN_DOMAIN`, add it to `MANAGE_ALLOWED_HOSTS`, and uncomment the admin
   block in `deploy/Caddyfile`.

### Memorial photo and opening screen

Add the photo under **Settings → Memorial photo**. The browser shrinks it to at
most 1000 px before uploading, so the page stays light on mobile data. It is
stored in `uploads/memorial/` and covered by the uploads backup below. The
opening screen (portrait in a flickering candle-light ring) shows it as soon as
the page opens, then fades into the page once the data has loaded. Visitors can
tap to skip it, and people who prefer reduced motion see a still version.

### Link previews (WhatsApp, Facebook, SMS)

Under **Settings → Link preview**, create the 1200×630 preview card (portrait,
name, dates, tribute). The page's title and Open Graph tags are rendered by the
server, so apps that never run JavaScript still see them. Two conditions for
previews to appear on other people's phones: the page must be **published**, and
reachable on the internet at the address in `PUBLIC_URL` (for example
`https://gonzi.example.org`, served through the HTTPS profile). Apps cache
previews, so a changed preview can take a while to show.

## Run without Docker

Requirements: Rust (stable, 1.94+), Node.js 20.12+ (only to build the frontend)
and poppler (`pdftotext`):

```sh
brew install poppler                   # macOS
sudo apt install poppler-utils         # Debian/Ubuntu

cp .env.example .env
(cd frontend && npm ci && npm run build)
cd backend
cargo run --release -- user add kalume
cargo run --release                    # serves frontend/dist on :8080 and :8081
```

Development with live reload:

```sh
cd backend && cargo run                # API on :8080 / :8081
cd frontend && npm run dev             # http://localhost:5173/manage (proxies /api to :8081)
```

## Demo data

Fictional data goes into a **separate** database. The seed refuses to run on a
database that already has records:

```sh
# Docker
MCHANGO_DB=demo.sqlite MCHANGO_UPLOADS=demo-uploads docker compose run --rm mchango seed
MCHANGO_DB=demo.sqlite MCHANGO_UPLOADS=demo-uploads docker compose run --rm mchango user add demo
MCHANGO_DB=demo.sqlite MCHANGO_UPLOADS=demo-uploads docker compose up -d
# Without Docker (from backend/)
DATABASE_PATH=../data/demo.sqlite UPLOADS_DIR=../data/demo-uploads cargo run -- seed
```

The demo includes an October statement. It is queued automatically and
contains matches, an amount conflict, a suggested match without a reference, and
a missing contribution, so you can try every part of reconciliation. Demo data
is clearly marked as such on every page.

## Backups

The database must be copied with SQLite's backup mechanism, not by copying the
live file. `mchango backup` uses `VACUUM INTO`, which is safe while the server
runs.

```sh
mkdir -p backups
D=$(date +%F)
# Database
docker compose exec mchango mchango backup /data/backups/mchango-$D.sqlite
docker compose cp mchango:/data/backups/mchango-$D.sqlite backups/
# Statements and receipts
docker run --rm -v mchango-data:/data -v "$PWD/backups":/backup debian:trixie-slim \
  tar czf /backup/uploads-$D.tgz -C /data uploads
```

Without Docker: `cargo run --release -- backup ../backups/mchango-$D.sqlite` and
`tar czf ../backups/uploads-$D.tgz -C ../data uploads`. The `sqlite3` tool's
`.backup` command also works.

Keep copies off the server, and test a restore now and then.

## Restore

```sh
D=2026-11-02
docker compose stop mchango
docker run --rm -v mchango-data:/data -v "$PWD/backups":/backup debian:trixie-slim sh -c "
  cp /backup/mchango-$D.sqlite /data/mchango.sqlite &&
  rm -f /data/mchango.sqlite-wal /data/mchango.sqlite-shm &&
  rm -rf /data/uploads && tar xzf /backup/uploads-$D.tgz -C /data &&
  chown -R 10001:10001 /data"
docker compose start mchango
```

Without Docker: stop the server, copy the backup over `DATABASE_PATH`, delete
any `-wal`/`-shm` files next to it, restore the uploads directory, then start
the server.

## Upgrades

`git pull && docker compose up -d --build`. Migrations run automatically at
start-up. Take a backup first.
