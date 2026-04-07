# Prelaunch Checklist

## Configuration
- [ ] `BOT_TOKEN` set
- [ ] `DATABASE_URL` set
- [ ] `WEBAPP_URL` set
- [ ] `PAYMENTS_ENABLED=true` set
- [ ] `PAYMENT_PROVIDER` set (`telegram_stars` or `virtual_wallet`)
- [ ] `PAYMENT_WEBHOOK_SECRET` set
- [ ] `ADMIN_TOKEN` set

## API/Backend
- [ ] `/healthz` returns 200
- [ ] `/api/register` creates profile and blocks duplicates
- [ ] `/api/user/:id` returns `registered` flag
- [ ] `/api/premium/invoice-link` creates invoice and returns payment URL/link
- [ ] `/api/payments/webhook` idempotency verified (double call does not double grant)
- [ ] `/api/admin/*` requires valid admin token

## Functional
- [ ] New user cannot play before registration
- [ ] Referral link registration attaches to inviter
- [ ] No-ref registration attaches to random available referrer
- [ ] Premium gating (7 -> 8 -> 9 -> 10) enforced
- [ ] Rank economy still works after backend changes

## Security
- [ ] Rate limit works on sensitive endpoints
- [ ] Webhook invalid secret rejected (403)
- [ ] Admin token invalid rejected (403)
- [ ] DB tables/indexes created successfully on startup

## Launch gate
- [ ] Payment smoke test passed with real provider
- [ ] Admin panel smoke test passed
- [ ] Backup/rollback plan prepared
