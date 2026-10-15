# Deploying with Docker and GitHub Actions

```
 git push main ──► GitHub Actions ──► test ──► build images ──► push to ghcr.io ──► SSH to server
                                                                                      │
              Server (Docker Compose):  web (Caddy, HTTPS) ──► api (Node) ──► db (MySQL)
```

- **web**: Caddy. Serves the landing page and admin panel, gets HTTPS certificates automatically,
  adds the security headers and forwards `/api` to the API.
- **api**: the Node backend. Not reachable from the internet directly.
- **db**: MySQL 8.4 with its data in a Docker volume. Not reachable from the internet.

Every push to `main` runs the tests and, if they pass, deploys automatically. Pull requests only run the tests.

---

## One-time setup

### 1. Get a server and a domain

- A Linux VPS with **Ubuntu 24.04**, at least **2 GB RAM** (MySQL needs it). Any provider works; pick a
  data centre in India (Mumbai / Bangalore) for speed.
- Two DNS **A records** pointing at the server's public IP, for example:
  - `geo.guidanceias.com` → landing page
  - `admin.guidanceias.com` → admin panel

### 2. Prepare the server

SSH in as root (or a sudo user) and run:

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh                 # Docker + Compose plugin

# A user that the pipeline logs in as
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /opt/geo-app/backups && chown -R deploy:deploy /opt/geo-app

# Firewall: only SSH and web traffic
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw allow 443/udp
ufw enable
```

### 3. Create the deploy SSH key

On **your computer**:

```bash
ssh-keygen -t ed25519 -f geo_deploy -C "github-actions" -N ""
```

Put the **public** key on the server:

```bash
# on the server, as root
mkdir -p /home/deploy/.ssh
echo "PASTE THE CONTENTS OF geo_deploy.pub HERE" >> /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

Get the server's host key (lets GitHub check it's really your server), on your computer:

```bash
ssh-keyscan -H YOUR_SERVER_IP
```

### 4. Create the settings file on the server

```bash
# on the server, as deploy
cd /opt/geo-app
nano .env        # paste deploy/production.env.example from the repo and fill in every value
chmod 600 .env
```

Generate passwords and secrets with `openssl rand -hex 24` (DB passwords) and `openssl rand -hex 48`
(`JWT_SECRET`). Set `ADMIN_ALLOWED_IPS` to your office/home IPs (find yours at https://ifconfig.me).

### 5. Add secrets to GitHub

Repository → **Settings → Secrets and variables → Actions**:

| Type | Name | Value |
|---|---|---|
| Secret | `SSH_HOST` | server IP or hostname |
| Secret | `SSH_USER` | `deploy` |
| Secret | `SSH_PRIVATE_KEY` | contents of the `geo_deploy` file (private key, including the BEGIN/END lines) |
| Secret | `SSH_KNOWN_HOSTS` | output of `ssh-keyscan -H YOUR_SERVER_IP` |
| Variable | `DEPLOY_ENABLED` | `true`: switches on the deploy step (until then pushes are only tested and built) |
| Variable | `LANDING_DOMAIN` | e.g. `geo.guidanceias.com` (used for the post-deploy health check) |
| Variable (optional) | `SSH_PORT` | if SSH isn't on 22 |
| Variable (optional) | `DEPLOY_DIR` | if not `/opt/geo-app` |

Optional: **Settings → Environments → production → Required reviewers** to approve each deploy
by hand before it goes out.

Delete `geo_deploy` from your computer once it's saved in GitHub, or keep it somewhere safe.

### 6. First deploy

Push to `main`, or open **Actions → CI/CD → Run workflow**. The first run takes a few minutes. When
it finishes, the site is live on HTTPS (Caddy fetches the certificates on first start; DNS must
already point at the server).

### 7. Create your admin login

```bash
cd /opt/geo-app
docker compose exec api node scripts/create-admin.js you@guidanceias.com 'A-long-password' "Your Name"
```

### 8. Point Razorpay's webhook at the server

Razorpay Dashboard → Webhooks → Add: `https://geo.guidanceias.com/api/webhooks/razorpay`, with the
same secret as `RAZORPAY_WEBHOOK_SECRET` and events `payment.captured`, `payment.failed`, `order.paid`.

---

## Day to day

| Task | Command (on the server, in `/opt/geo-app`) |
|---|---|
| Deploy a change | just push to `main` |
| See what's running | `docker compose ps` |
| API logs | `docker compose logs -f api` |
| Restart everything | `docker compose restart` |
| Change a setting in `.env` | edit `.env`, then `docker compose up -d` |

### Roll back

Every deploy is tagged with its commit. To go back, either re-run an older successful run's
**Deploy to production** job in GitHub Actions, or on the server:

```bash
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<first 12 characters of the old commit>/' .env
docker compose up -d
```

### Backups (set this up on day one)

Daily database dump at 2 AM, kept for 14 days. As `deploy`, run `crontab -e` and add:

```
0 2 * * * cd /opt/geo-app && docker compose exec -T db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"' | gzip > backups/db-$(date +\%F).sql.gz && find backups -name 'db-*.sql.gz' -mtime +14 -delete
```

Copy the `backups/` folder off the server regularly (e.g. with `rclone` to Google Drive or S3). A
backup on the same server won't help if the server is lost.

Restore a backup:

```bash
gunzip -c backups/db-2026-10-15.sql.gz | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
```

### Database changes

`schema.sql` only runs the very first time the database starts (empty volume). Later schema
changes ship as files in `backend/migrations/`; apply each once:

```bash
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < migration.sql
```

### Using Cloudflare in front (recommended)

Turn the DNS records to *Proxied* (orange cloud), set SSL/TLS mode to **Full (strict)**, and
uncomment the `trusted_proxies` block at the top of `deploy/Caddyfile` so rate limits and the admin
IP allow-list see real visitor IPs.

---

## Running the Docker setup on your computer

```bash
docker compose up --build
```

Landing page on http://localhost:8080, admin panel on http://localhost:8081. Add Razorpay test keys
in a `.env` file next to `compose.yaml` (see the comments at its top). Create an admin with the
command from step 7.
