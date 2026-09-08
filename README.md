# claimIT

Secure USDC payment links on Arc Testnet — deposit, share a link, recipient claims into an auto-created or existing wallet.

**Live app:** [lootclaim.vercel.app](https://lootclaim.vercel.app)

## Stack

Next.js (App Router) · TypeScript · TailwindCSS · Prisma (Postgres) · Circle Wallets (Developer-Controlled treasury + User-Controlled recipient wallets) · Arc Testnet.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start a local Postgres. Either:
   - `docker compose up -d` (uses `docker-compose.yml`, standard local Postgres on port 5432), or
   - `npx prisma dev` (Prisma's own local dev server, no Docker required)

   Set `DATABASE_URL` in `.env` to match whichever you use (see `.env.example`).
3. Apply migrations:
   ```bash
   npx prisma migrate deploy
   ```
4. Copy `.env.example` to `.env` and fill in the values relevant to the milestone you're working on.
5. Run the dev server:
   ```bash
   npm run dev
   ```

## Database

Schema lives in `prisma/schema.prisma`. After changing it:
```bash
npx prisma migrate dev --name <change description>
npx prisma generate
```

The Prisma Client is generated into `src/generated/prisma` (gitignored) and re-exported via `src/lib/db.ts`, which wraps it with the `@prisma/adapter-pg` driver adapter required by this Prisma version.

## Project structure

```
src/
  app/         App Router pages, layouts, and API routes (route.ts)
  components/  Reusable UI components
  lib/         Cross-cutting utilities (db client, auth config, Circle SDK wrappers, rate limiting)
  server/
    services/     Business logic (link creation, claim verification, payouts)
    repositories/ Prisma queries, isolated from route handlers
  types/       Shared TypeScript types
```

## Notes for contributors (and future Claude sessions)

- This project pins to a recent Next.js major version with real breaking changes from older training data — see `AGENTS.md` and `node_modules/next/dist/docs/` before assuming an API (e.g. `proxy.ts`, not `middleware.ts`).
- Prisma is on a version using driver adapters (`@prisma/adapter-pg`) and `prisma.config.ts` for the datasource — not the older `url = env(...)` schema-only pattern.
- Arc is Circle's USDC-native L1, currently testnet only. See project architecture notes for the escrow/custody model and why gas is deducted from claimed amounts rather than charged to recipients.

## License

MIT — see [LICENSE](./LICENSE).
