# Security

How the landing page, API and admin panel are protected, and what you must set up when you go live.

## Built into the code

| Threat | Protection |
|---|---|
| Bots submitting the form | Cloudflare Turnstile CAPTCHA, verified on the server (token single-use, hostname checked); hidden honeypot field; strict per-IP rate limits |
| Form flooding / brute force | 5 registrations and 10 payment attempts per IP per 15 min; 60 API requests per IP per minute; 10 admin login attempts per 15 min |
| Reading other students' data | Each registration gets a random secret token (only its SHA-256 hash is stored). Starting a payment needs the token, so guessing registration IDs reveals nothing |
| Paying a wrong amount | Fee is set on the server (`COURSE_FEE_INR`); the browser can't change it |
| Fake "payment successful" calls | Razorpay signatures checked with HMAC-SHA256 (constant-time); webhooks verified against the raw body |
| SQL injection | Every query is parameterised; all input validated with zod (length limits, formats, no URLs or markup in names) |
| XSS / malicious scripts | Page has no inline scripts; strict Content Security Policy (via nginx); React escapes all output in the admin panel |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| Admin panel break-in | bcrypt passwords, short-lived JWT, login rate limit, server refuses a weak `JWT_SECRET` in production, optional IP allow-list in nginx |
| Spreadsheet attacks via CSV export | Cells starting with `= + - @` are escaped |
| Large or malformed requests | 20 KB JSON body limit in the API, 32 KB in nginx, request timeouts |
| Spoofed visitor IPs | `TRUST_PROXY` set to the real number of proxies, so rate limits can't be bypassed with fake `X-Forwarded-For` headers |

## Go-live checklist

**Deploying with Docker (recommended, see [deploy/DEPLOY.md](deploy/DEPLOY.md))?** Items 1, 3, 6 and 7 are
handled for you: Caddy provides HTTPS and the security headers, `TRUST_PROXY` is set, the admin panel is
limited to `ADMIN_ALLOWED_IPS`, and MySQL runs as a non-root user that isn't exposed. You still need
items 2, 4, 5, 8, 9 and 10. The nginx notes below are for installing without Docker.

1. **HTTPS everywhere.** Use `deploy/nginx.example.conf` and `certbot`. Never serve the form over plain HTTP.
2. **Turn on the CAPTCHA.** Cloudflare dashboard → Turnstile → Add widget (free). Hostname: your landing
   domain. Put the keys in `backend/.env` as `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and set
   `TURNSTILE_HOSTNAMES`. Without these the server logs a warning and the form has no CAPTCHA.
3. **Set `TRUST_PROXY=1`** when the API runs behind nginx (leave `0` without a proxy).
4. **Strong secrets.** `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   Set `RAZORPAY_WEBHOOK_SECRET` and the same value in the Razorpay dashboard.
5. **Live Razorpay keys only on the server.** `RAZORPAY_KEY_SECRET` lives in `backend/.env` only, never in the
   landing page or admin panel. `.env` is git-ignored; keep it that way.
6. **Lock the admin panel.** Uncomment the `allow … / deny all;` lines in the nginx config with your office and
   home IPs, and use a long admin password.
7. **Database.** Create a dedicated MySQL user with rights only on this database (not `root`), and don't
   expose MySQL's port 3306 to the internet (firewall: allow 22, 80, 443 only).
8. **Put Cloudflare in front (recommended, free plan).** Turn on *Bot Fight Mode* and *Always Use HTTPS*,
   and add a rate-limiting rule for `/api/registrations`. This also absorbs DDoS traffic before it reaches
   your server. Then restore real visitor IPs in nginx (link in the nginx config).
9. **Keep things updated.** Run `npm audit` and `npm update` in `backend/` and `admin/` regularly, and
   `sudo apt upgrade` on the server.
10. **Watch the admin panel.** A sudden burst of registrations with odd names is a sign bots are getting
    through; tighten the Turnstile widget mode or the rate limits.

## Upgrading an existing database

Run `backend/migrations/002_access_token.sql` once if your database was created before this update.
