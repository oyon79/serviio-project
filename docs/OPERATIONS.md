# SERVIIO Operations Guide

## Admin Review Flow

1. Admin signs in and opens `frontend/admin.html`.
2. Verification queue shows provider profiles with submitted KYC evidence.
3. Admin opens provider details, downloads documents when available, and
   approves or rejects each document.
4. Admin approves or rejects the provider profile.
5. Provider receives in-app notifications about approval or rejection.

## Provider Verification Flow

1. Provider signs in and opens `frontend/profileBooking.html`.
2. Provider completes profile settings and uploads KYC documents from the
   Verification tab.
3. Provider submits the profile for review.
4. Admin decisions are stored in `provider_verification_audit_logs`.

## Booking Lifecycle

1. Customer creates booking from schedule page.
2. Customer pays before provider travel/work can proceed.
3. Provider accepts request.
4. Provider marks `ON_THE_WAY`.
5. Provider marks `ARRIVED`.
6. Customer shares the 4-digit handshake code in person.
7. Provider verifies the code and starts `IN_PROGRESS`.
8. Provider completes the booking.
9. Escrow can be released when lifecycle and dispute rules allow it.

## Refund and Dispute Flow

1. Customer or provider opens a support ticket.
2. Refund, dispute, and safety tickets mark held escrow as `DISPUTED`.
3. Admin reviews the support thread and booking record.
4. Admin can refund escrow from the admin booking/support controls.

## Emergency Flow

1. Customer opens SOS page or emergency schedule path.
2. Emergency log stores message, location text, and GPS coordinates when
   available.
3. Admin SOS panel shows active incidents.
4. Admin marks incidents resolved or cancelled.

## Communication Flow

1. Customer/provider chooses a booking in profile/dashboard Messages.
2. Messages are stored in `booking_messages`.
3. Call requests are stored in `booking_call_requests`.
4. Socket.IO broadcasts updates only to authenticated booking participants.
