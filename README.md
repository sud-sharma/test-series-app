# Test Series: Registrations, Razorpay & Admin Panel

```
test-series-app/
├── backend/   Node.js + Express API, MySQL, Razorpay orders/verification/webhook
├── admin/     React (Vite) admin panel
└── landing/   Drop-in script that connects the landing page form to the API + Razorpay Checkout
```

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
├── main.js       live fee from the API, intro video player, footer year
├── checkout.js   registration form → API → Razorpay Checkout
└── images/       your photos (create this folder)
```

Run it locally (with the backend running on :4000):

```bash
npx serve landing -l 8080     # http://localhost:8080  (already in CORS_ORIGINS)
```

Don't open `index.html` by double-clicking: browsers send a `null` origin from `file://`, which CORS rejects.

**Before going live, edit `index.html`:**

- Replace every `[bracketed]` placeholder (institute name, exam, dates, address, phone, email…).
  The fee doesn't need editing: it's loaded from `COURSE_FEE_INR` on the server.
- Set `window.TS_API_URL` near the bottom to your API URL, and add the landing page's origin to `CORS_ORIGINS`.
- **Intro video:** on `#intro-video`, set `data-youtube-id="VIDEO_ID"` (YouTube) **or**
  `data-video-src="video/intro.mp4"` (self-hosted), and optionally `data-poster="images/video-poster.jpg"`.
  The video only loads when the visitor presses play.
- **Photos:** put them in `landing/images/` as `test-hall.jpg`, `classroom.jpg`, `faculty.jpg`,
  `toppers.jpg` and `building.jpg` (or change the `src`). Until a photo exists, its colored placeholder shows.

How the form behaves: it validates instantly in the browser (same rules as the server), saves the
registration, then swaps the submit button for **Pay ₹… now**. Payment opens Razorpay Checkout; on
success the step indicators turn green and the student sees a confirmation.

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
| GET | `/api/admin/registrations` | JWT | List with `search`, `status`, `classLevel`, `mode`, `page`, `limit` |
| GET | `/api/admin/registrations/export.csv` | JWT | CSV download with the same filters |
| GET | `/api/admin/registrations/:id` | JWT | One registration and its payment attempts |
| DELETE | `/api/admin/registrations/:id` | JWT | Delete an unpaid registration |

## Admin panel features

- Sign in with email and password (JWT, login rate-limited)
- Dashboard: revenue, paid / pending / failed counts, conversion, last-14-days chart, paid by class and mode
- Registrations: search, filter by status / class / mode, pagination, CSV export
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
