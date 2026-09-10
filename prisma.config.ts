import { defineConfig } from "prisma/config";

// Prisma 7 config: connection URL for CLI commands (migrate, studio) lives
// here, not in schema.prisma. The runtime PrismaClient gets its own
// connection via a driver adapter - see src/prisma/prisma.service.ts.
//
// Read directly from process.env (not the `env()` helper) so `prisma
// generate` still works with no DATABASE_URL set (e.g. a fresh checkout
// before .env.development exists) - only migrate/studio actually need it.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "ts-node prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
