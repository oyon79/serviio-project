# SERVIIO API Contract Map

Base URL: `http://localhost:5000/api`

Authentication uses `Authorization: Bearer <jwt>` unless an endpoint is marked
public. Staff roles are `admin`, `super_admin`, `support_agent`, and
`verification_officer`; customer/provider roles remain separate.

## Auth

- `POST /auth/register` public
  - Body: `first_name`, `last_name`, `email`, `phone`, `password`, `role`
  - Provider body also requires `nid`
  - Returns: `token`, `user` when registration verification is disabled
  - Returns: `verification_required: true`, `user`, and delivery status when
    registration OTP verification is enabled
- `POST /auth/verify-registration` public
  - Body: `email`, `otp`
  - Verifies a pending registration OTP and returns `token`, `user`
- `POST /auth/resend-registration-otp` public
  - Body: `email`
  - Generates a fresh pending registration OTP for an unverified account
- `POST /auth/login` public
  - Body: `email`, `password`
  - Returns: `token`, `user`
- `GET /auth/me` authenticated
  - Returns current account profile.
- `PUT /auth/me` authenticated
  - Body: `first_name`, `last_name`, `phone`
  - Updates editable customer account fields.
- `POST /auth/forgot-password` public
  - Body: `email`, optional `phone`
  - Sends or generates reset instructions.
- `GET /auth/validate-reset-token?token=...` public
- `POST /auth/reset-password` public
  - Body: `token`, `otp`, `password`, `confirmPassword`

## Providers

- `GET /providers` public
  - Lists verified/available providers.
- `GET /providers/:id` public
  - Provider detail profile.
- `GET /providers/me` provider
- `PUT /providers/me/settings` provider
- `PUT /providers/me/availability` provider
- `GET /providers/me/reviews` provider
- `GET /providers/me/verification` provider
- `POST /providers/me/verification/documents` provider multipart
  - Fields: `document_type`, optional `document_number`, `document_url`,
    `file_name`, `notes`, file `document_file`
- `POST /providers/me/verification/submit` provider

## Bookings

- `POST /bookings/create` customer
  - Body: `provider_id`, `service_type`, `booking_date`, optional
    `job_location`, `estimated_price_range`, `is_emergency`
  - Server calculates `quoted_amount`.
- `GET /bookings/my` authenticated customer/provider
- `GET /bookings/provider` provider
- `GET /bookings/provider/:providerId` provider self only
- `GET /bookings/:id` booking participant/admin
- `PATCH /bookings/:id/status` assigned provider
  - Status: `PENDING`, `ACCEPTED`, `ON_THE_WAY`, `ARRIVED`, `IN_PROGRESS`,
    `COMPLETED`, `CANCELLED`
- `POST /bookings/verify-handshake` assigned provider
  - Body: `booking_id` or `bookingId`, `handshake_code` or `handshakeCode`
- `DELETE /bookings/:id` booking participant/admin with lifecycle limits

## Communications

- `GET /communications/bookings/:bookingId/messages` booking participant/admin
- `POST /communications/bookings/:bookingId/messages` booking participant/admin
  - Body: `message`
- `GET /communications/bookings/:bookingId/call-requests` booking participant/admin
- `POST /communications/bookings/:bookingId/call-requests` booking participant/admin
  - Body: optional `call_type` (`VOICE` or `VIDEO`), optional `reason`
- `PATCH /communications/call-requests/:id` call participant/admin
  - Body: `status` (`ACCEPTED`, `DECLINED`, `COMPLETED`, `MISSED`, `CANCELLED`)

## Payments and Wallet

- `POST /payments/process` customer
  - Body: `booking_id`, optional `amount`, `payment_method`,
    `gateway_reference`
- `GET /payments/status/:booking_id` booking participant/admin
- `GET /wallet/me` authenticated
- `GET /wallet/payout-requests/me` provider
- `POST /wallet/payout-requests` provider
  - Body: `amount`, `payout_method` (`BKASH`, `NAGAD`, `BANK`),
    `account_ref`, optional `provider_notes`
- `GET /wallet/payout-requests/admin` admin/super_admin/support_agent
- `PATCH /wallet/payout-requests/:id` admin/super_admin/support_agent
  - Body: `status` (`APPROVED`, `REJECTED`, `PAID`), optional
    `reviewer_notes`, `external_reference`
- `POST /wallet/escrow/:booking_id/release` booking participant/admin rules
- `POST /wallet/escrow/:booking_id/refund` admin/super_admin/support_agent

## Reviews, Bookmarks, Support

- `POST /reviews` customer
- `GET /reviews/my` customer
- `GET /reviews/provider/:providerId` public
- `GET /bookmarks` customer
- `GET /bookmarks/:providerId/status` customer
- `POST /bookmarks` customer
- `DELETE /bookmarks/:providerId` customer
- `POST /support/tickets` authenticated
- `GET /support/tickets/my` authenticated
- `GET /support/tickets/:id` ticket participant/admin
- `POST /support/tickets/:id/messages` ticket participant/admin
- `GET /support/tickets/admin` staff
- `PATCH /support/tickets/:id` admin/super_admin/support_agent

## Admin

- `GET /admin/overview` staff
- `GET /admin/providers` staff
- `GET /admin/bookings` staff
- `GET /admin/verification-queue` staff
- `GET /admin/verification-queue/:profileId` staff
- `POST /admin/providers/:profileId/verify` admin/super_admin/verification_officer
- `POST /admin/providers/:profileId/verification-decision` admin/super_admin/verification_officer
- `PATCH /admin/verification-documents/:documentId` admin/super_admin/verification_officer
- `GET /admin/verification-documents/:documentId/download` admin/super_admin/verification_officer
- `GET /admin/emergencies` staff
- `PATCH /admin/emergencies/:id` admin/super_admin/support_agent

## Emergency and Notifications

- `POST /emergency` public, authenticated preferred
- `GET /notifications` authenticated
- `PATCH /notifications/:id/read` authenticated
- `PATCH /notifications/read-all` authenticated

## Socket.IO Events

Authenticate with `auth: { token }` or event payload `token`.

- `notifications:join` joins `user_room:<id>`
- `booking:join` joins a booking room after participant check
- `user:join_booking` joins tracking room after participant check
- `provider:join_booking` provider joins assigned booking room
- `provider:join` provider joins provider room
- `provider:location` provider broadcasts provider-level location
- `location_update` provider broadcasts booking-level location

Server emits:

- `notification:new`
- `booking:message:new`
- `booking:call:requested`
- `booking:call:updated`
- `location_update`
