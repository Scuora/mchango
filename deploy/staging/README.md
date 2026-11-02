# Mchango on schul-staging

The backend runs on `schul-staging` (DigitalOcean droplet, Ubuntu 24.04, x86_64)
next to the `schul` stack, without touching it. **Nothing is public yet:** both
listeners are on the server's loopback only. The public site will be served by
Netlify later (see the last section). That step needs approval.

## What runs where

| | |
| --- | --- |
| Server directory | `/opt/mchango` (`compose.yml`, `mchango.env`, `releases.log`, `migration/`) |
| Compose project | `mchango`. Always pass `-p mchango -f /opt/mchango/compose.yml` |
| Container | `mchango-staging-app` (image `mchango:staging` → `mchango:<release>`) |
| Volume | `mchango-staging-data` → `/data` (`mchango.sqlite`, `uploads/`, `backups/`) |
| Network | `mchango_default` (own bridge, not `schul_default`) |
| Public listener | `127.0.0.1:18080` on the server |
| Management | `127.0.0.1:18081` on the server |

The names differ from the Mac's live instance (`mchango-app`, volume
`mchango-data`), so a command run on the wrong machine fails rather than
touching the other copy.

## Manage it (SSH tunnel)

```sh
ssh -N -L 18081:127.0.0.1:18081 schul-staging
# then open http://127.0.0.1:18081/manage and sign in with your usual account
```

Use `127.0.0.1`, not `localhost`. Browsers share cookies across ports of the
same host name. The Mac's own instance is on `localhost:8081`, so this keeps
the two sign-ins apart. To preview the public page, tunnel the other port:
`ssh -N -L 18080:127.0.0.1:18080 schul-staging`, then open `http://127.0.0.1:18080/`.

Status and logs:

```sh
ssh schul-staging docker compose -p mchango -f /opt/mchango/compose.yml ps
ssh schul-staging docker compose -p mchango -f /opt/mchango/compose.yml logs --tail 100 mchango
```

## Update (safe to re-run)

```sh
cd deploy/staging
ansible-playbook deploy.yml                                   # build from the repo root
ansible-playbook deploy.yml -e mchango_src=/path/to/a/copy    # build from a frozen copy of the repo
ansible-playbook deploy.yml -e mchango_build_on=mac           # build on the Mac instead (slow uplink)
```

`deploy.yml` does the following:

1. It builds the image on the server by default. A ~0.3 MB tarball of the
   source is streamed over SSH into `docker build -`. The build is native
   amd64, capped to 3 of 4 cores and 2 GB RAM. Each build so far took 10–16
   min; unchanged layers come from the server's cache.
2. It writes `compose.yml`, plus `mchango.env` only if that file is missing.
3. It backs up the running database to `/data/backups/pre-<release>-<time>.sqlite`.
4. It retags `mchango:staging` and runs `docker compose -p mchango up -d --wait`.
5. It checks four things:
   - `/api/health` answers on 18080.
   - Management answers 401 on 18081.
   - The public listener returns 404 for management.
   - Every published port is on 127.0.0.1.
6. It appends the release to `/opt/mchango/releases.log`.

Settings such as `PUBLIC_URL` live in `/opt/mchango/mchango.env` on the server.
After editing that file, run `ssh schul-staging docker compose -p mchango -f /opt/mchango/compose.yml up -d`.

## Roll back

```sh
ssh schul-staging cat /opt/mchango/releases.log                 # pick the previous release
ansible-playbook deploy.yml -e mchango_skip_build=true -e mchango_release=<previous release>
```

Migrations only move forward. A release older than the data's newest migration
will not start; sqlx reports "migration N was previously applied but is
missing". For example, release `20261102-211022` predates `0010_pledge_groups`,
so it cannot run on today's data. If the bad release changed the database,
also put back the backup taken just before it. The commands below run on the
server:

```sh
docker compose -p mchango -f /opt/mchango/compose.yml stop mchango
docker run --rm --network none --user 0 -v mchango-staging-data:/data --entrypoint /bin/sh mchango:staging -c \
  'cp /data/backups/pre-<release>-<time>.sqlite /data/mchango.sqlite && rm -f /data/mchango.sqlite-wal /data/mchango.sqlite-shm && chown 10001:10001 /data/mchango.sqlite'
docker compose -p mchango -f /opt/mchango/compose.yml up -d
```

## Data

`migrate-data.yml` copies the Mac's live data (accounts as Argon2 hashes,
records, settings, uploads) to the server. It was used for the first
deployment.

```sh
ansible-playbook migrate-data.yml -e mchango_src=<source the server image was built from>
ansible-playbook migrate-data.yml -e mchango_use_copy=<dir with mchango.sqlite + uploads.tgz>   # restore a given copy
```

- It uses `mchango backup` (SQLite `VACUUM INTO`), so the Mac's app keeps running.
- It checks the copy's integrity.
- **The copy's migrations must match the code on the server, in both
  directions.** An applied migration that was later edited fails the check.
  So does a migration the data has but the code lacks. In that case, deploy
  that code first; sqlx would refuse to start otherwise.
- It drops sessions, so everyone signs in again on staging.
- It verifies checksums after transfer and checks that the account count matches.
- It refuses to replace a server database that has accounts, or one it cannot
  read, unless you pass `-e mchango_data_force=true`. Before replacing
  anything, it copies the server's database files to
  `/data/backups/pre-import-<time>-*`.

**Once managers work on staging, the Mac copy is out of date.** Do not keep
editing both. After switching, stop recording on the Mac (or stop
`mchango-app`) so the two do not drift apart.

Ad-hoc backup on the server:
`docker exec mchango-staging-app mchango backup /data/backups/manual-$(date +%F-%H%M).sqlite`.
Keep copies off the server too.

## Shared-host rules

- Only ever operate on `-p mchango` / `mchango-staging-*`. Never `docker system|image|volume prune`:
  it would also act on the `schul` stack's objects.
- The classic builder leaves untagged `<none>` stage images. The Rust stage is
  ~2.3 GB and the Node stage ~1.3 GB, and they are the next build's cache. The
  `schul` stack has untagged images of its own, so never clean up "dangling"
  images wholesale. If space is ever needed, remove ours by ID, using the
  creation times in `docker image ls -a`. There are also base images the
  build pulled: `rust:1.99-slim-trixie`, `node:22.21-trixie-slim` and
  `debian:trixie-slim`.
- The server build uses Docker's classic builder because the server has no
  buildx plugin and only the classic builder takes CPU/RAM caps. Docker marks
  it deprecated. If a Docker upgrade removes it, use `-e mchango_build_on=mac`,
  or install buildx on the server (a package change, so ask first).
- `/opt/schul/nginx/conf.d` is rendered by Ansible (`roles/staging_vm_stack`).
  Change it through that role, never by hand.

## Later, with approval: the public site on Netlify (in this order)

1. **Hostname.** Pick the backend's public name, e.g. `staging-mchango.schul.co.ke`.
   In Cloudflare, add an A record to `164.90.230.69`, **proxied**, the same as
   the other staging hosts. Make sure the name has no Cache Everything rule
   and no bot challenge.
2. **Bridge to nginx.**
   ```sh
   scp deploy/staging/compose.edge.yml schul-staging:/opt/mchango/
   ansible-playbook deploy.yml          # picks the overlay up automatically
   ```
   This adds `mchango-staging-edge`, a TCP forwarder for port 8080 only, on
   `schul_default`. The app and its management port stay off that network.
3. **nginx.** Put `nginx-mchango.conf.example` into the Ansible role, with the
   hostname filled in, and apply it the role's usual way. nginx-certbot
   (`USE_LOCAL_CA=1`) creates the origin certificate, and Cloudflare serves the
   public certificate.
4. **Check from anywhere.**
   - `curl https://<host>/api/health` should return `{"status":"ok"}`.
   - `curl -i https://<host>/manage` should return 404.
   - `curl -i https://<host>/api/manage/auth/me` should return 404.
5. **Git + Netlify.**
   1. Put the repo in git and push it to the remote Netlify will watch.
   2. Create the site with base directory `frontend`. `frontend/netlify.toml`
      does the rest.
   3. In that file, replace `https://mchango-backend.invalid` (3 rules) with
      `https://<host>`, then push to `master`.
6. **PUBLIC_URL.** In `/opt/mchango/mchango.env`, set
   `PUBLIC_URL=https://<netlify site or custom domain>`. Then run
   `docker compose -p mchango -f /opt/mchango/compose.yml up -d`.
7. **Phone test.**
   - The page and opening portrait load.
   - Check my contribution works.
   - A WhatsApp link preview appears. This needs the Open Graph change listed
     in the deployment notes, because Netlify serves a plain `index.html`.

To undo step 2:
`docker compose -p mchango -f /opt/mchango/compose.yml -f /opt/mchango/compose.edge.yml rm -sf mchango-edge`,
then `rm /opt/mchango/compose.edge.yml`. Undo step 3 through the Ansible role.
Undo step 5 by rolling back the deploy in Netlify.
