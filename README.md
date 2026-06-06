# SERVIIO

SERVIIO is a local service marketplace prototype for customers, service
providers, and admins. It includes customer/provider registration, JWT login,
role-based dashboards, provider discovery, booking, mock payment with escrow,
reviews, bookmarks, notifications, support tickets, emergency fallback, and
provider KYC/admin approval flows.

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
   ```

4. Start XAMPP Apache and MySQL.

5. Import the database schema and demo data:

   ```bash
   C:\xampp\mysql\bin\mysql.exe -u root < database\serviio_schema.sql
   C:\xampp\mysql\bin\mysql.exe -u root < database\demo_seed.sql
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
- Customer: `customer@serviio.test`
- Provider: `provider@serviio.test`
- Provider: `plumber@serviio.test`

## Tests

```bash
npm test
```

Current automated coverage focuses on backend validation middleware. Manual
smoke tests were run for login, provider listing, booking creation, mock
payment, provider booking fetch, notifications, and admin verification queue.

## Notes

- Email delivery is optional. In development, forgot-password returns the reset
  link and OTP in the JSON response if SMTP variables are not configured.
- Payments are mock payments and escrow records; no real payment gateway is
  connected.
- Provider document upload currently stores document references/URLs, not
  binary file uploads.
- Some frontend pages are static HTML pages with inline JavaScript, so browser
  refresh is required after edits.
