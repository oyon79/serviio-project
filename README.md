# SERVIIO

SERVIIO is a local service marketplace prototype for customers, service
providers, and operations staff. It includes customer/provider registration
with optional OTP account verification, JWT login, role-based dashboards,
provider discovery, booking, booking-scoped messaging and call requests,
payment adapters with escrow, provider payout requests, reviews, bookmarks,
notifications, support tickets, emergency fallback, and provider KYC/admin
approval flows.

## Tech Stack

- Frontend: static HTML, CSS, and vanilla JavaScript served from `frontend/`
- Backend: Node.js, Express, Socket.IO
- Database: MariaDB/MySQL via `mysql2`
- Local server layout: XAMPP Apache + XAMPP MariaDB

## Setup

1. Install backend dependencies:

   ```bash
   cd backend
   npm install
   ```

2. Copy the backend environment template:

   ```bash
   copy .env.example .env
   ```

3. Set required values in `backend/.env`:

   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=serviio_db
   JWT_SECRET=replace_this_with_a_long_random_secret
   PORT=5000
   FRONTEND_BASE_URL=http://localhost/serviio-project/frontend
   CORS_ORIGIN=*
   PAYMENT_MODE=mock
   MOCK_PAYMENTS_ENABLED=true
   REGISTRATION_VERIFICATION_REQUIRED=false
   ```

4. Start XAMPP Apache and MySQL.

5. Import the database schema and demo data:

   ```bash
   C:\xampp\mysql\bin\mysql.exe -u root < database\serviio_schema.sql
   C:\xampp\mysql\bin\mysql.exe -u root < database\demo_seed.sql
   ```

6. Apply incremental migrations after pulling updates:

   ```bash
   npm run backup-db
   npm run migrate
   ```

7. Load deterministic demo fixtures when you want seeded accounts and a
   completed paid booking:

   ```bash
   npm run seed:demo
   ```

## Run

From the project root:

```bash
npm start
```

Or from `backend/`:

```bash
npm start
```

Frontend URL:

```text
http://localhost/serviio-project/frontend/login.html
```

Backend health check:

```text
http://localhost:5000/api/test-db
```

## Demo Accounts

All demo accounts use password:

```text
Passw0rd!
```

- Admin: `admin@serviio.test`
- Super Admin: `superadmin@serviio.test`
- Support Agent: `support@serviio.test`
- Verification Officer: `verification@serviio.test`
- Customer: `customer@serviio.test`
- Provider: `provider@serviio.test`
- Provider: `plumber@serviio.test`

## Tests

```bash
npm test
npm run qa:frontend
npm run validate-config
npm run backup-db
npm run seed:demo
npm run smoke:api
npm run smoke:browser
npm run readiness:live
npm run verify:release
```

Current automated coverage includes auth/role middleware, route-level auth and
booking validation gates, a throwaway MySQL database flow for
auth/registration OTP/provider/booking/payment/escrow/review, backend
validation middleware, booking lifecycle transitions, server-side price
estimation, payment gateway adapter guards, SMS OTP delivery behavior, KYC
verification adapter behavior, and authenticated Socket.IO booking/location
guards.
Automated smoke tests cover login, provider discovery, booking creation,
payment/escrow, lifecycle transitions, booking messages, call requests,
support tickets, customer reviews, SOS/admin emergency handling, provider KYC
submission, admin KYC approval, and provider payout review.
Headless Chrome smoke tests cover representative public, customer, provider,
and admin frontend pages when Apache, the backend, Chrome/Edge, and demo seed
data are available locally.
Frontend static QA also enforces shared API configuration loading before
API/socket scripts so local URLs can be rewritten for deployed origins.
`npm run readiness:live` verifies configured SMTP/SMS/payment/KYC providers.
Use `LIVE_READINESS_STRICT=true` for launch checks so missing live SMTP/SMS,
payment, and KYC probes plus mock payment/KYC modes fail.
`npm run verify:release` runs the local release gate end to end. Re-run as
`npm run verify:release -- --strict-live` before launch after setting real
`LIVE_READINESS_*` probe values.

## Notes

- Email delivery is optional in development. SMS OTP delivery is available
  through a generic HTTP provider adapter. In production,
  `REGISTRATION_VERIFICATION_REQUIRED` defaults to true and requires SMTP or SMS
  delivery. In development, forgot-password and registration verification return
  local OTPs in JSON only when no delivery provider succeeds.
- Payments support explicit dev-mode mock verification, SSLCommerz validation,
  bKash tokenized payment status checks, and a configurable Nagad verification
  endpoint.
- Provider verification supports secure PDF/image uploads into
  `backend/uploads/verification`; admins download these files through protected
  API routes. NID documents can record external verification results when a
  provider API is configured.
- Booking lifecycle now follows request -> accepted -> on the way -> arrived ->
  handshake/working -> completed/cancelled, with timestamps.
- Customer/provider communication is booking-scoped through
  `/api/communications`, with persisted messages, call request records,
  notifications, and authenticated booking socket rooms.
- Customer profile editing uses authenticated `/api/auth/me` read/update
  endpoints and keeps local session data in sync.
- Emergency/SOS logs notify admins and appear in the admin SOS panel.
- Some frontend pages are static HTML pages with inline JavaScript, so browser
  refresh is required after edits.
- Database backups can be created with `npm run backup-db` and restored with
  `SERVIIO_RESTORE_CONFIRM=I_UNDERSTAND npm run restore-db -- path/to/backup.sql`.

## Handover Docs

- API contract map: `docs/API.md`
- Admin/provider/customer operations: `docs/OPERATIONS.md`
- Deployment and rollback: `docs/DEPLOYMENT.md`
- Known limitations: `docs/KNOWN_LIMITATIONS.md`
