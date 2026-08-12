# ClaimIT

## What this is

A Web3 payment link app on Arc Testnet. Core mechanic: sender creates a link with escrowed USDC; any wallet can open the link and claim the exact sender-specified amount. First-come-first-served, one-time claim. Recipients without an existing wallet get one created for them inline (Circle User-Controlled Wallets with PIN setup) — no wallet is a hard requirement to receive money.

Original one-line pitch: "Create a link, send it like a message, and whoever opens it claims the USDC from a completely unrelated wallet."

## Stack

Next.js, Prisma, Better Auth, Circle Developer-Controlled Wallets (treasury), Circle User-Controlled Wallets (recipient/sender, hosted PIN UI), Arc Testnet.

## Core product decisions (don't relitigate these without a reason)

- **First-come-first-served claims.** No partial/split claims. Enforced by a DB unique constraint on `Claim.paymentLinkId` — a race just fails to insert, no manual locking.
- **Recipients receive the exact sender-specified amount, no deduction.** `payoutFromTreasury` sends the full escrowed amount. ClaimIT absorbs the real (sub-cent) gas cost as an operating expense, tracked via `networkFeeInUSD` from the webhook for internal accounting only — never subtracted from payout. `PaymentLink.amountMicros` is unambiguous: it's both the exact deposit and the exact claim amount.
- **Wallet UX is dual-path.** If the person has a wallet, use it. If not, Circle creates one inline (embedded/User-Controlled). This isn't fully silent — PIN setup is one interactive step through Circle's hosted UI, which is inherent to it being non-custodial.
- **Secrets live in `.env`, never in git.** `.env` and `recovery/` (entity secret recovery file) are gitignored. `NEXT_PUBLIC_*` vars are exposed client-side by Next.js convention — `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` must never carry that prefix.
- **The entity secret is generated and registered by the human, not the agent.** Generating it locally is harmless (pure crypto, no network call). Registering it (`registerEntitySecretCiphertext`) permanently binds it to the Circle account and must be run by the account owner, not triggered by Claude Code.

## Architecture patterns established so far

- **PENDING_DEPOSIT reconciliation pattern.** `/api/links/prepare` writes a `PaymentLink` row as `PENDING_DEPOSIT` *before* the client can attempt the transfer — before money can move, a durable record already exists. `/api/links/confirm` promotes the same row to `ACTIVE` (idempotent, safe to call twice). A reconciliation job (`POST /api/cron/reconcile-deposits`, secret-protected) sweeps stale `PENDING_DEPOSIT` rows and self-heals if `confirm` ever crashes after the on-chain deposit succeeded. This replaced an earlier design where drafts lived only in a short-lived httpOnly cookie — that lost password/expiration data if anything crashed mid-flow. Real production cron scheduling needs a deployed environment (Vercel Cron); locally it's triggered manually.
- **Compliance-aware transfer completion.** Never mark a claim `SUCCEEDED` just because Circle *accepted* a transfer — it can still be denied by compliance screening after acceptance. Use `waitForState: 'COMPLETE'` (bounded by a timeout, ~15s) before considering it final. Both a terminal failure and a timeout release the claim reservation, same as an outright payout failure — a transient issue can't permanently brick a link.
- **Double-claim protection** is a DB unique constraint, not app-level locking.
- **Password brute-force protection** is a DB-backed lockout via `AuditLog` (5 attempts/15min) — deliberately not Redis; claim attempts are low-frequency enough not to need that infra.
- **Public endpoints leak no oracle.** `GET /api/links/[token]` returns public metadata with no way to distinguish "invalid token" from other failure modes, so tokens can't be brute-forced/enumerated.
- **On-chain amounts are truth, not client-supplied values.** When creating records from a deposit, the confirmed on-chain amount is used — never trust a number the client sends.
- **Verify against installed SDK type definitions, not just doc prose.** Docs have been wrong more than once (e.g. `recoveryFileDownloadPath` is a directory, not a file path, contrary to the sample docs). When something about a Circle SDK call is ambiguous, check the actual installed package types.
- **The database must stay unreachable from Supabase's Data API.** Supabase serves PostgREST over the `public` schema, authorised by a key that is public by design. Tables Prisma creates inherit project default privileges granting `anon`/`authenticated` full DML and arrive with RLS off — which once exposed every table, `session` included, to anyone with the publishable key. Three locks now hold: privileges revoked, RLS on with no policies, and `USAGE` on the schema revoked from `PUBLIC` (which is where `anon` actually inherited it — revoking "FROM anon" alone is a no-op). The app is unaffected because it connects as the owning `postgres` role. Run `npm run security:check-db` after any schema change; it asserts all three. claimIT never uses PostgREST, so there is no legitimate `anon` access to grant back.

## Known deferred items (need a public HTTPS deployment to test for real)

- Webhook delivery (Circle needs a public URL to hit)
- Apple Sign In (requires HTTPS, won't work on localhost)
- Real cron scheduling for the reconciliation job
All three are blocked on Milestone 9 (Deployment), not bugs — don't try to force-test them locally.

## Milestone status

1–8 complete and verified end-to-end (not just compiled): auth (Better Auth, guest/Google/Apple/email OTP), treasury + entity secret setup, recipient wallet provisioning, USDC transfers, payment link creation, claim flow, dashboard (sent/received, correctly scoped to session). Milestone 9 (Deployment) is next and last on the current plan.

## Working conventions

- Every milestone should be verified against the real Circle testnet API / real Postgres / real on-chain state before being called done — a build/lint pass is not sufficient proof.
- When something breaks with money already moved on-chain, don't just retry — check whether the underlying on-chain state is correct before assuming the DB record can just be recreated from scratch.
- Fix root causes, not just symptoms, when a bug surfaces mid-build (this has been the pattern throughout — e.g. the PENDING_DEPOSIT redesign rather than just adding a retry).
