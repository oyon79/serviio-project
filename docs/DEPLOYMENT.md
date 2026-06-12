# SERVIIO Deployment and Rollback

## Pre-deploy Checklist

- Set `NODE_ENV=production`.
- Set a strong `JWT_SECRET`.
- Set production database credentials.
- Set `CORS_ORIGIN` to the real frontend origin, not `*`.
- Provision staff users with least-privilege roles:
  `super_admin`, `support_agent`, and `verification_officer`.
- Set SMTP credentials if password reset email delivery must be live.
- Set SMS provider credentials if password reset SMS OTP delivery must be live.
- Keep `REGISTRATION_VERIFICATION_REQUIRED=true` for production account
  onboarding and confirm SMTP or SMS OTP delivery before launch.
- Set NID verification mode/provider credentials before relying on external
  KYC checks.
- Set payment gateway credentials before enabling non-mock payment mode.
- Set `PLATFORM_COMMISSION_RATE` as a decimal rate from `0` up to but not
  including `1`; for example, `0.10` means 10%.
- Confirm `backend/uploads/verification` is writable and not publicly served.
- Run `npm audit --omit=dev`.
- Run `npm test`.
- Run `npm run qa:frontend`.
- If the frontend is hosted on a separate origin, set
  `window.SERVIIO_API_BASE_URL` before `frontend/js/config.js` or serve the API
  from the same origin. Frontend QA enforces that API/socket code loads after
  this shared config wrapper.
- Run `npm run validate-config`.
- Run `npm run backup-db` before applying migrations to existing data.
- Run `npm run migrate`.

## Environment Variables

Required:

- `JWT_SECRET`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `MYSQLDUMP_PATH`
- `MYSQL_PATH`
- `DB_BACKUP_DIR`

Recommended:

- `PORT`
- `SHUTDOWN_TIMEOUT_MS`
- `FRONTEND_BASE_URL`
- `CORS_ORIGIN`
- `CORS_CREDENTIALS`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`
- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_RATE_LIMIT_MAX`
- `SERVIIO_DEBUG_LOGS`
- `SERVIIO_SOCKET_DEBUG`
- `LOGIN_MAX_FAILED_ATTEMPTS`
- `LOGIN_LOCK_MINUTES`
- `REGISTRATION_VERIFICATION_REQUIRED`
- `REGISTRATION_VERIFICATION_EXPIRY_MINUTES`
- `REGISTRATION_VERIFICATION_MAX_ATTEMPTS`
- `PLATFORM_COMMISSION_RATE`
- `PAYMENT_MODE`
- `MOCK_PAYMENTS_ENABLED`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_SECURE`
- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_FROM`
- `SMS_PROVIDER_URL`
- `SMS_PROVIDER_API_KEY`
- `SMS_SENDER_ID`
- `KYC_MAX_FILE_MB`
- `NID_VERIFICATION_MODE`
- `NID_VERIFICATION_URL`
- `NID_VERIFICATION_API_KEY`
- `NID_VERIFICATION_TRUTHY_FIELDS`
- `NID_VERIFICATION_STATUS_FIELDS`
- `NID_VERIFICATION_MATCH_VALUES`
- `NID_VERIFICATION_MISMATCH_VALUES`
- `NID_VERIFICATION_REFERENCE_FIELDS`
- `POLICE_VERIFICATION_MODE`
- `POLICE_VERIFICATION_URL`
- `POLICE_VERIFICATION_API_KEY`
- `POLICE_VERIFICATION_TRUTHY_FIELDS`
- `POLICE_VERIFICATION_STATUS_FIELDS`
- `POLICE_VERIFICATION_MATCH_VALUES`
- `POLICE_VERIFICATION_MISMATCH_VALUES`
- `POLICE_VERIFICATION_REFERENCE_FIELDS`
- `SKILL_VERIFICATION_MODE`
- `SKILL_VERIFICATION_URL`
- `SKILL_VERIFICATION_API_KEY`
- `SKILL_VERIFICATION_TRUTHY_FIELDS`
- `SKILL_VERIFICATION_STATUS_FIELDS`
- `SKILL_VERIFICATION_MATCH_VALUES`
- `SKILL_VERIFICATION_MISMATCH_VALUES`
- `SKILL_VERIFICATION_REFERENCE_FIELDS`
- `PAYMENT_GATEWAY_TIMEOUT_MS`
- `BKASH_BASE_URL`
- `BKASH_APP_KEY`
- `BKASH_APP_SECRET`
- `BKASH_USERNAME`
- `BKASH_PASSWORD`
- `NAGAD_VERIFY_URL`
- `NAGAD_MERCHANT_ID`
- `NAGAD_API_KEY`
- `LIVE_READINESS_STRICT`
- `LIVE_READINESS_SMS_TO`
- `LIVE_READINESS_SMS_MESSAGE`
- `LIVE_READINESS_PAYMENT_AMOUNT`
- `LIVE_READINESS_SSLCOMMERZ_VAL_ID`
- `LIVE_READINESS_BKASH_PAYMENT_ID`
- `LIVE_READINESS_NAGAD_PAYMENT_REF`
- `LIVE_READINESS_NID_NUMBER`
- `LIVE_READINESS_NID_FULL_NAME`
- `LIVE_READINESS_NID_DOB`
- `LIVE_READINESS_NID_PHONE`
- `LIVE_READINESS_DOCUMENT_FULL_NAME`
- `LIVE_READINESS_DOCUMENT_PHONE`
- `LIVE_READINESS_POLICE_DOCUMENT_NUMBER`
- `LIVE_READINESS_SKILL_DOCUMENT_NUMBER`
- `SERVIIO_E2E_BASE_URL`
- `SERVIIO_E2E_PAYMENT_METHOD`
- `SERVIIO_E2E_GATEWAY_REFERENCE`

For `*_VERIFICATION_MODE=generic_http`, use the `*_TRUTHY_FIELDS`,
`*_STATUS_FIELDS`, `*_MATCH_VALUES`, `*_MISMATCH_VALUES`, and
`*_REFERENCE_FIELDS` variables to map the live provider JSON response. Nested
fields use dot paths, for example `verification.result` or `data.reference`.

## Migration Procedure

From project root:

```bash
npm run backup-db
npm run migrate
```

The current migration runner is forward-only and records applied files in
`schema_migrations`. A database backup should be taken before migrations on any
environment that contains real data.

## Demo/Test Fixtures

For local QA after loading the schema and migrations:

```bash
npm run seed:demo
```

This creates deterministic admin, customer, provider, booking, payment, escrow,
wallet, and review data. Do not run demo fixtures against production data.

## Rollback Procedure

Rollback uses application rollback plus database restore from a pre-deploy
backup:

1. Stop the backend process.
   The server handles `SIGINT`/`SIGTERM` by closing Socket.IO, the HTTP server,
   and the MySQL pool. `SHUTDOWN_TIMEOUT_MS` controls the maximum graceful
   shutdown wait before the process exits.
2. Restore the database from the pre-deploy backup:
   ```bash
   SERVIIO_RESTORE_CONFIRM=I_UNDERSTAND npm run restore-db -- database/backups/<backup-file>.sql
   ```
3. Revert application files to the previous release.
4. Start the backend.
5. Run smoke checks:
   - `GET /api/test-db`
   - Login
   - Provider listing
   - Booking create
   - Payment processing in the configured mode

For a local automated customer/provider/admin smoke run:

```bash
npm run seed:demo
npm run smoke:api
```

The smoke runner verifies login, provider discovery, booking/payment/escrow,
booking lifecycle, communication, support tickets, customer reviews, SOS/admin
emergency handling, and KYC submission/approval.

The legacy PowerShell E2E script can also target non-local backends without
editing the file:

```powershell
$env:SERVIIO_E2E_BASE_URL='https://api.example.com'
$env:SERVIIO_E2E_PAYMENT_METHOD='sslcommerz'
$env:SERVIIO_E2E_GATEWAY_REFERENCE='<sandbox-payment-reference>'
.\backend\scripts\e2e_test.ps1
```

## Local Production Smoke

```bash
cd backend
npm run backup-db
npm run verify:release
node server.js
```

`npm run smoke:browser` requires Apache/static frontend access and a local
Chrome or Edge install; it starts the backend temporarily if port 5000 is not
already healthy.

`npm run readiness:live` validates configured SMTP, SMS, payment, and KYC
providers. Set the `LIVE_READINESS_*` probe variables in `.env` first. Strict
mode reports missing SMTP/SMS/payment/KYC probe configuration as failures, and
it also fails if payment or verification providers are still disabled or using
mock mode.

`npm run verify:release` runs tests, frontend QA, config validation, dependency
audit, migrations, seed fixtures, API smoke, browser smoke, and local live
readiness. For launch, run `npm run verify:release -- --strict-live` after
setting real `LIVE_READINESS_*` probe values. Use `--skip-browser` only on CI
runners or servers without Apache/static frontend access or Chrome/Edge.

Open:

- `http://localhost:5000/api/test-db`
- `http://localhost/serviio-project/frontend/login.html`
