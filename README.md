# Geography (Optional) 500+ Video Programme: Landing Page, Payments & Admin Panel

```
test-series-app/
├── landing/   Landing page with registration form and Razorpay Checkout
├── backend/   Node.js + Express API, MySQL, Razorpay orders/verification/webhook
└── admin/     React (Vite) admin panel
```

## Concession students

Old students, repeaters and optional students choose their category on the form. They are
registered but **not sent to online payment**, because their fee is lower than the standard
₹7,355. They appear in the admin panel under **Concession requests to call** so the team can
confirm their fee and collect it. New students pay the full fee online straight away.

## How payment works

1. **Student submits the form** → `POST /api/registrations` saves it with status `pending`.
2. **Student clicks Pay** → `POST /api/payments/order` creates a Razorpay order. The amount is
   always read from the server (`COURSE_FEE_INR`), never from the browser.
3. **Razorpay Checkout** opens. On success the browser sends the signature to
   `POST /api/payments/verify`, which checks the HMAC and marks the registration `paid`.
4. **Webhook** (`POST /api/webhooks/razorpay`) does the same server-to-server, so a payment is
   recorded even if the student closes the tab before step 3. Both paths are idempotent.

## Setup

Requirements: Node.js 18+, MySQL 8 (or MariaDB 10.5+), a Razorpay account (test mode keys are fine).

### 1. Backend

```bash
cd backend
cp .env.example .env        # fill in DB, Razorpay keys, fee, JWT_SECRET
npm install
npm run db:init             # creates the database and tables
npm run create-admin -- admin@yourinstitute.in 'StrongPass123' "Admin Name"
npm run dev                 # http://localhost:4000
```

Generate a JWT secret with:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

`COURSE_FEE_INR` is the total charged by Razorpay, including GST (7355 by default). If you change
the fee, also update the fee breakdown table in `landing/index.html`.

Already ran `db:init` with the earlier version (class / mode fields)? Apply
`backend/migrations/001_student_type.sql` once. Fresh installs don't need it.

### 2. Admin panel

```bash
cd admin
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :4000)
```

For production: set `VITE_API_URL` in `admin/.env` to your API URL, run `npm run build`, and
serve `admin/dist` from any static host (Nginx, Netlify, etc.). Add that origin to
`CORS_ORIGINS` in the backend `.env`.

### 3. Landing page

`landing/` is the full landing page (plain HTML/CSS/JS, no build step):

```
landing/
├── index.html    the page
├── styles.css    theme and layout
├── main.js       live fee from the API, YouTube players, footer year
└── checkout.js   registration form → API → Razorpay Checkout
```

Run it locally (with the backend running on :4000):

```bash
npx serve landing -l 8080     # http://localhost:8080  (already in CORS_ORIGINS)
```

Don't open `index.html` by double-clicking: browsers send a `null` origin from `file://`, which CORS rejects.

**Before going live, edit `index.html`:**

- Set `window.TS_API_URL` near the bottom to your API URL, and add the landing page's origin to `CORS_ORIGINS`.
- **Himanshu Sir videos:** paste a YouTube Shorts link into `data-youtube=""` on each of the four
  `.short` cards in the videos section (`#videos`), e.g. `data-youtube="https://youtube.com/shorts/AbCdEfGhIjK"`.
- **Mentor intro video (optional):** paste a YouTube link into `data-youtube=""` on the video in the
  "What's included" section.
- Any YouTube link format works (shorts, watch, youtu.be). Videos load only when the visitor presses
  play. A card without a link is hidden, and the videos section and its menu link stay hidden
  until at least one Short is added.

How the form behaves: it validates instantly in the browser (same rules as the server) and saves the
registration. New students then get a **Pay ₹7,355 now** button that opens Razorpay Checkout; on
success the step indicators turn green. Concession categories get a message that the team will call
them to confirm their fee.

### 4. Razorpay webhook

Dashboard → Account & Settings → Webhooks → Add:

- URL: `https://api.yourinstitute.in/api/webhooks/razorpay`
- Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured`, `payment.failed`, `order.paid`

To test webhooks locally, expose port 4000 with a tunnel such as ngrok or cloudflared.

## API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/course` | – | Course name, fee and public Razorpay key |
| POST | `/api/registrations` | – | Save the registration form |
| POST | `/api/payments/order` | – | Create a Razorpay order for a registration |
| POST | `/api/payments/verify` | – | Verify Checkout signature, mark paid |
| POST | `/api/webhooks/razorpay` | signature | Razorpay events |
| POST | `/api/admin/login` | – | Returns a JWT |
| GET | `/api/admin/stats` | JWT | Dashboard numbers |
| GET | `/api/admin/registrations` | JWT | List with `search`, `status`, `studentType` (or `concession`), `page`, `limit` |
| GET | `/api/admin/registrations/export.csv` | JWT | CSV download with the same filters |
| GET | `/api/admin/registrations/:id` | JWT | One registration and its payment attempts |
| DELETE | `/api/admin/registrations/:id` | JWT | Delete an unpaid registration |

## Admin panel features

- Sign in with email and password (JWT, login rate-limited)
- Dashboard: revenue, paid / pending / failed counts, conversion, last-14-days chart, registrations
  and payments by student category, and a count of concession students waiting for a call
- Registrations: search, filter by status / category (or all concession categories), pagination, CSV export
- Detail drawer with every payment attempt (order ID, payment ID, method, failure reason)

## Security notes

- Fee comes from server config; the client can't change the amount.
- Payment and webhook signatures are checked with HMAC-SHA256 and constant-time comparison.
- All SQL uses parameterised queries; input is validated with zod.
- Helmet headers, CORS allow-list, rate limits on public endpoints and admin login.
- CSV export escapes cells to prevent spreadsheet formula injection.
- Paid registrations can't be deleted from the admin panel.

## Tests

```bash
cd backend && npm test      # signature verification tests
```
