# Known Limitations

- bKash now has a tokenized payment status adapter and readiness probe support,
  but it still needs real sandbox/production merchant credentials and
  provider-side checkout testing.
- Nagad is wired through a configurable verification endpoint because merchant
  API contracts vary by integration. Set `NAGAD_VERIFY_URL` and confirm the
  response mapping with the provider before live use.
- SSLCommerz has a validation hook, but full hosted checkout initiation should
  be tested with merchant sandbox/production credentials before launch.
- SMS OTP has a generic HTTP adapter and readiness probe support. It must be
  mapped to the exact SMS vendor request/response contract before production.
- Registration OTP verification is implemented and defaults to required in
  production, but the live SMTP/SMS delivery path still must be tested with the
  final vendor credentials before launch.
- NID, police clearance, and skill certificate verification have
  disabled/mock/generic HTTP modes and readiness probe support, and they record
  external verification results on submitted documents. Configure the generic
  HTTP field mappings for the exact vendor response contracts, then validate
  them with sandbox/production credentials before launch.
- Migration rollback is documented as manual restore; automated down migrations
  are not implemented.
- Automated tests cover important backend logic, route gates, a throwaway MySQL
  integration path, seeded API smoke paths, and a local headless Chrome browser
  smoke path. Live third-party provider sandbox behavior still needs
  `LIVE_READINESS_STRICT=true npm run readiness:live` with real probe values
  and non-mock payment/KYC modes before launch. In strict mode, missing SMTP,
  SMS, payment, NID, police, or skill verification probes are hard failures.
- Human exploratory visual QA with production-like credentials and real vendor
  sandbox accounts is still required before launch.
