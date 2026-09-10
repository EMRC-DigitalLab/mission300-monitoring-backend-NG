# M300 Nigeria Energy Compact Dashboard — Backend

NestJS API for the M300 monitoring dashboard. Owns everything the frontend
must not calculate itself: submission validation, approval-state
transitions, KPI aggregation, and audit history. See the frontend repo's
README for the boundary this backend is expected to honour.

## Requirements

- Node.js 24.x (see `.node-version`)
- pnpm 10.x
- Docker + Docker Compose (for local Postgres/RabbitMQ)

## Local development

```bash
pnpm install
copy .env.example .env.development
docker compose -f docker/docker-compose.yml --env-file .env.development up
```

This starts Postgres + RabbitMQ + the API (hot-reloading, migrations run
automatically on container start). Seed sample data once the stack is up:

```bash
pnpm prisma:seed
```

Swagger docs are served at `/docs` once the API is running.

## Quality commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm check      # typecheck + lint + test + build
```

## Architecture

```
src/
  main.ts               bootstrap: helmet, CORS, validation, swagger
  app.module.ts          wires every module + global guards/interceptors
  config/                env validation (zod) - fails fast on bad config
  prisma/                PrismaService/PrismaModule (global)
  events/                RabbitMQ connection + publishers/consumers
  common/
    guards/               JwtAuthGuard, RolesGuard, InstitutionScopeGuard
    decorators/            @Public, @Roles, @CurrentUser, @AuditAction
    interceptors/          AuditLogInterceptor (auto audit trail)
    filters/                consistent error responses
  modules/
    auth/                 login, JWT strategy
    health/                 /health for Docker + CD health checks
    institutions/           institution + data-custodian registry
    submissions/             draft -> pending -> under_review -> decision
    kpis/                     KPI catalogue + live values
    programs/                  programmes -> projects
    bottlenecks/
    reports/                     async report generation (RabbitMQ worker)
    stakeholders/
    administration/
      users/, audit-log/, branding/
```

### Non-negotiable rules (enforced in code, not just convention)

1. **Submissions and KPI values are separate tables.** A `KpiValue` is only
   ever written from `SubmissionsService.recordDecision()`, inside the same
   transaction as the review decision, when the decision is `APPROVE` or
   `PROVISIONALLY_APPROVE`. Nothing else may write to `kpi_values`.
2. **Submission status transitions go through `submissions.state-machine.ts`.**
   `assertValidTransition()` throws on any transition not in the explicit
   table - this is checked in the service layer, so a direct API call can't
   bypass it even if a UI button is disabled.
3. **RBAC is enforced by guards, not by hiding UI.** `JwtAuthGuard` requires
   a valid session on every route by default (`@Public()` opts out).
   `RolesGuard` reads `@Roles(...)` metadata and blocks anything not listed.
4. **Institution scoping is explicit.** `scopeInstitutionFilter(user)` (in
   `common/guards/institution-scope.guard.ts`) must be used in any service
   query that lists cross-institution data - never trust a client-supplied
   `institutionId` filter for a non-admin caller.
5. **Every mutating endpoint that matters is tagged `@AuditAction(...)`.**
   `AuditLogInterceptor` is registered globally and writes an
   `audit_log_entries` row automatically - no controller has to remember to
   log anything by hand.
6. **Slow work goes through RabbitMQ, not the request/response cycle.**
   Report generation is the reference example
   (`modules/reports` + `events/consumers/generate-report.consumer.ts`).

## Deployment

Unlike a lot of NestJS starters, this one does **not** target a managed
cloud platform - it deploys to a **shared Hostinger VPS** via Docker Compose
over SSH, not Azure Container Apps. "Shared" matters: that VPS already runs
several other projects' stacks (KEDCO, EMRC ERP, Raven, etc.) side by side,
each on its own port, with no container anywhere binding `:80`/`:443` - a
host-level reverse proxy (outside Docker) is what actually routes public
domains to those ports. This backend follows the exact same convention.

**staging and production run on that same VPS**, isolated from each other
(and from every other project on the box) purely through:

| | staging | production |
|---|---|---|
| Docker Compose project (`-p`) | `m300-backend-staging` | `m300-backend-production` |
| App directory | `/opt/m300-backend/staging/.env` | `/opt/m300-backend/production/.env` |
| Host port (loopback-only, `127.0.0.1:<port>`) | `8099` | `8100` |
| Database/RabbitMQ | own containers, own Docker network per project | own containers, own Docker network per project |

Ports were picked by checking `docker ps` on the box for what's already
taken (`3000, 8000, 8082-8083, 8090-8098, 9000` were in use at last check) -
re-verify before changing them. Postgres and RabbitMQ are never published to
the host at all, matching how every other stack on this box runs its own
databases internally-only.

- `docker/docker-compose.prod.yml` — one shared compose file for both
  environments (api + postgres + rabbitmq). No Caddy/nginx in this stack -
  the box's existing host-level proxy is expected to `proxy_pass` to
  `127.0.0.1:8099` (staging) / `127.0.0.1:8100` (production); see
  `scripts/vps-bootstrap.sh`'s printed instructions for the exact server
  blocks to add there.
- `scripts/vps-bootstrap.sh` — one-time VPS setup: confirms Docker (already
  present on this box), creates the deploy user and
  `/opt/m300-backend/{staging,production}` directories. Safe to re-run.
- `.github/workflows/ci.yml` — lint, typecheck, unit + e2e tests, build, and
  a test-only Docker build. Runs on every PR and push to `main`/`staging`,
  and is reused as a gate by `deploy.yml`.
- `.github/workflows/deploy.yml` — on push to `staging` (→ staging
  environment) or a `v*.*.*` tag (→ production environment): runs the CI
  gate, builds and pushes the image to **GitHub Container Registry**
  (`ghcr.io`), runs `prisma migrate deploy` against that environment's
  database, writes that environment's `.env` on the VPS from GitHub
  Environment secrets, runs `docker compose -p <project> ... up -d` scoped
  to that environment only, and polls a health check.

### Temporary, deliberately loose bits (to close before a real launch)

No domain is wired up yet, so two things are intentionally permissive right
now and **must be tightened before this is a real production launch**:

- **`CORS_ORIGIN` is blank for both environments**, which makes the API
  reflect whatever `Origin` header it receives (see `src/main.ts`) - i.e. it
  accepts requests from any frontend URL, any port, including arbitrary
  Vercel preview deployments. Fine while there's no fixed frontend URL yet;
  a real security hole once this API is handling real data publicly. Set
  `CORS_ORIGIN` to the actual frontend origin(s) once known.
- **The deploy health check runs from inside the VPS** (`curl
  127.0.0.1:<port>/health` over the same SSH session), not from a public
  URL, because the API is intentionally loopback-only until a domain +
  host-level reverse proxy exist. `scripts/health-check.sh` (external,
  polls a public URL) is still there for once that's wired up - swap it
  back in and add `DEPLOY_HEALTH_CHECK_URL` as an environment secret at
  that point.
- `.env.github.example` — checklist of GitHub secrets required by
  `deploy.yml`. Per-environment values (DB credentials, JWT secret, CORS
  origin) must be set under **Settings → Environments → staging /
  production** specifically, not as repo-level secrets - that's what lets
  the same secret name hold a different value per environment sharing the
  one VPS.

You can also run this exact stack locally on your machine via
`docker/docker-compose.yml` (see Local development above) - that's
independent of the `staging` git branch/VPS deploy and useful for testing
before pushing.

## Environment variables

`.env.example` is the template. Copy it to `.env.<environment>` locally
(`.env.development`, `.env.staging`, `.env.production`) - these are
git-ignored. `NODE_ENV` selects which file `ConfigModule` loads. The same
variable names are re-declared as GitHub Actions secrets for CD (see
`.env.github.example`) and injected into the container at deploy time.
