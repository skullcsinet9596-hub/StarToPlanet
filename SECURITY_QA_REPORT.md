# Security and QA Report

Date: 2026-04-07

## Scope
- Registration and referral flow
- Premium payment flow (invoice + webhook + idempotency)
- Admin API and admin UI MVP
- Database integrity hardening

## Implemented hardening
- Added rate limits:
  - `/api/register`
  - `/api/save`
  - `/api/premium/invoice-link`
  - `/api/payments/webhook`
- Added admin authorization middleware:
  - `x-admin-token` / `?token=...`
  - all `/api/admin/*` endpoints protected
- Added validation/sanitization for `/api/save` numeric payload fields.
- Added payment idempotency:
  - unique `provider_invoice_id`
  - `markPaymentPaid()` with transaction and row lock (`FOR UPDATE`)
- Added DB indexes for referrals and payments access patterns.

## Manual QA checklist status
- Registration gated before game start: implemented.
- Duplicate registration click protection: implemented.
- Existing-user message "Вы уже зарегистрированы": implemented.
- Referral attach without link -> random available referrer: implemented.
- Premium invoice flow:
  - provider abstraction implemented (`telegram_stars` / `virtual_wallet`).
  - mock checkout path for `virtual_wallet` implemented.
- Admin MVP:
  - users search
  - referral tree
  - payments list
  - economy config get/update
  - manual user adjustments

## Residual risks
- Current `virtual_wallet` integration is MVP (mock checkout) and must be replaced with real provider webhook signature verification and reconciliation.
- CORS currently open (`*`) for compatibility; tighten before production if possible.
- Client-side economics still exists for non-critical UX; critical payment/referral decisions are server-side.

## Recommended prelaunch actions
- Set strong env secrets:
  - `ADMIN_TOKEN`
  - `PAYMENT_WEBHOOK_SECRET`
- Disable `virtual_wallet` mock path in production once real provider is connected.
- Run production smoke tests for all payment states (pending, paid, duplicate webhook, invalid signature).
