import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Pool settings are deliberate, not defaults. Prisma 7's driver adapters
// inherit node-postgres' defaults, and two of them are wrong for serverless:
// `connectionTimeoutMillis` defaults to 0 (wait forever — a saturated pooler
// would hang a claim until the platform kills it mid-payout), and `max`
// defaults to 10 per pool, which multiplies across concurrent Vercel
// instances and blows past Supabase's connection ceiling.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 10_000,
});

export const db = global.__prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = db;
}
