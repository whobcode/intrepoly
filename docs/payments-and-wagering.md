# Payments, Wallets, and Wagering

This repo is not a gambling product. Real‑money play is regulated and risky. If you plan to enable wagers, you must address licensing, compliance, and payment security first.

## Big Requirements (Non‑Exhaustive)

- Licensing: Many US states (and countries) require a gaming license for games of chance or mixed skill. Obtain legal counsel to classify the game and determine scope.
- KYC/AML: Verify identity, age (21+ in some jurisdictions), and screen against sanctions/PEP lists.
- Geofencing: Block prohibited regions. Enforce IP + GPS checks where required.
- Fair Play: Publish rules/odds, dispute and refund policies, and audit logs.
- Custody: Avoid holding user funds directly. Use trusted payment processors or on‑chain escrow you don’t control.
- Taxes/Reporting: Handle 1099‑K/NEC or equivalents where applicable.

## Practical Integration Options

- Cash-like payments: Stripe, Cash App Pay, PayPal. These are easiest for deposits/withdrawals but typically prohibit gambling without approval.
- Crypto checkout (custody by processor): Coinbase Commerce, BitPay. They accept crypto and settle to you (fiat or crypto). You still need KYC/AML and gambling approval.
- Direct wallets (non‑custodial): WalletConnect (many EVM wallets), Coinbase Wallet SDK, RainbowKit. You’ll accept signed transactions; custody and refund logic become your responsibility.

## Suggested Architecture (Beta / Feature‑Flagged)

1. "Play‑money" mode only by default. Real‑money code paths hidden behind `WAGERING_ENABLED=false`.
2. Use a processor (e.g., Coinbase Commerce) for deposits into a per‑game escrow invoice. Do not custody funds.
3. Record deposits in Durable Objects (immutable ledger entries). Only allow starting a wagered game when all players have funded.
4. On game end, compute payouts deterministically in the Durable Object and instruct the processor to disburse (or issue refunds if the game is invalid).
5. Add strong audit logging and signatures for result proofs.

## Minimal API Sketch (not enabled)

- `POST /api/wager/create` → create a pending wager session (amount, currency, players).
- `POST /api/wager/fund` → return a payment link (e.g., Coinbase Commerce charge URL).
- `POST /api/wager/webhook` → processor webhook to mark funds received.
- `POST /api/wager/settle` → called by game DO on completion to trigger disbursement.

> Important: Enabling these endpoints in production without legal review is unsafe. Keep feature‑flagged and disabled in `wrangler.jsonc`.

## Next Steps

- Choose a processor and confirm they allow your use case.
- Add `WAGERING_ENABLED` and `PAYMENTS_PROVIDER` to `wrangler.jsonc` `vars`.
- Implement a provider module (e.g., `src/payments/coinbase.ts`) encapsulating webhooks and API calls.

