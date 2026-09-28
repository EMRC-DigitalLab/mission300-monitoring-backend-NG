# Mission 300 backend security assessment

**Date:** 28 September 2026

**Repository:** `mission300-monitoring-backend-NG`

**Assessed commit:** `5860fe170b607f6f6acc831e5f81d5b1d254e6d8` (`staging`)

**Status:** Report first. No production implementation changes, deployments, live data mutations or credential changes were made during this assessment.

**Remediation update:** This document preserves the original assessment of the commit above. Subsequent F01–F11 implementation changes and verification are recorded in [REMEDIATION.md](REMEDIATION.md); the historical finding descriptions below do not describe the patched working tree.

## Executive assessment

**The backend has significant application-level security weaknesses. It should not be considered secure merely because its existing tests or dependency audit pass.**

The most serious weaknesses concern authorization, institution isolation, session recovery, webhook delivery and credential logging. An authenticated read-only user can reach routes that change or delete operational records. A reviewer scoped to one institution can decide another institution's submission by supplying its identifier. Password reset does not invalidate existing sessions and can reactivate an account an administrator subsequently suspended. Webhooks can disclose events across institutions, and their network destination protections have gaps. Default HTTP logging retains credential headers.

There are also working protections: protected routes reject missing, forged, expired and revoked JWTs; inactive accounts cannot use normal JWT authentication; bottleneck deletion has a server-side role check; self-review is blocked by default; generic file downloads enforce ownership; DTO validation rejects unexpected fields; and the identify endpoint's rate limit works in the isolated application.

**Eleven findings are described below: seven rated High and four Medium.** These are qualitative priorities, not formal CVSS scores. No Critical rating is assigned because unauthenticated arbitrary code execution or equivalent compromise was not demonstrated. The absence of such a finding is not proof that no Critical vulnerability exists.

## Scope, method and evidence quality

The assessment covered authentication and session management, route authorization, institution and object access, data validation, uploads and storage, webhooks, CORS, logs and audit trails, dependencies, source secret hygiene, Docker configuration, deployment workflows and backups.

Methods used:

- Source review of controllers, guards, services, DTOs, configuration, Docker files and workflows.
- AST-based inventory of **107 application controller routes**, including **10 public routes**. The inventory identifies 20 authenticated mutation routes without a role decorator. Some are correctly protected by ownership or are appropriate for all users; this count is not a vulnerability count.
- **46 isolated audit tests across five suites.** Real Nest controllers, JWT verification, global JWT/role/throttling guards and DTO validation were used for HTTP authorization tests. Persistence and mutation services were stubbed so operational records could not be changed.
- Real authentication, submission, upload and webhook service logic exercised against controlled mock persistence. Concurrency was deliberately scheduled to reproduce the refresh race.
- HTTP logging exercised with the installed logger and fake credentials.
- Existing test suite: **285 tests across ten suites passed.** Typecheck passed after correcting an audit fixture's TypeScript assertion.
- Package registry audits: **0 reported advisories across 421 production dependencies**, and **0 reported advisories across 931 dependencies in the full dependency audit**. These are registry results at the time of assessment, not guarantees of vulnerability-free packages.

**Important interpretation:** audit tests named `[Fxx]` intentionally assert that a weakness can be reproduced. Their passing means the reproduction succeeded, not that a security requirement passed. Tests named `CONTROL` check expected protections. These audit reproductions are kept separately from the normal unit-test suite.

No active exploitation, load testing or state-changing requests were sent to staging or production. The live server, reverse proxy, firewall, secrets, database privileges, cloud metadata access and deployed image were not inspected. The service-level tests use mock persistence; full database-backed adversarial testing remains a follow-up. Local tooling emitted a Node 20 engine warning in some runs, while a later direct Node invocation reported Node 24. Rechecking the evidence in the pinned Node 24 CI/runtime environment is recommended.

## Findings at a glance

| ID | Priority | Finding | Evidence |
| --- | --- | --- | --- |
| F01 | High | Read-only accounts can access operational write routes | HTTP reproduction with real guards; wider source review |
| F02 | High | Submission decisions bypass institution isolation | Active service reproduction; read and write paths compared |
| F03 | Medium | Saved report deletion lacks role and ownership enforcement | HTTP reproduction plus service review |
| F04 | High | Password reset preserves existing access and refresh sessions | Authentication service reproduction |
| F05 | High | An outstanding reset token can reactivate a suspended account | Reset logic reproduction and administrator status-update review |
| F06 | Medium | Refresh token rotation is vulnerable to concurrent reuse | Controlled concurrent reproduction |
| F07 | High | Webhook subscriptions disclose events across institutions | Subscription and dispatch reproductions |
| F08 | High | Webhook SSRF protections have address, redirect and DNS gaps | Guard and dispatch reproductions; network exploitation not performed |
| F09 | Medium | Production CORS trusts every Vercel tenant | Origin policy reproduction |
| F10 | Medium | Generic upload checks trust spoofable file metadata | Upload service reproduction |
| F11 | High | HTTP logging retains session credentials | Installed logger reproduction with fake tokens |

## Detailed findings

### F01 — Operational mutations are reachable by read-only accounts

**Affected:** `src/modules/programs/programs.controller.ts`, `src/modules/programs/programs.service.ts`, `src/modules/bottlenecks/bottlenecks.controller.ts`.

With a correctly signed JWT for an active `READ_ONLY_USER`, the isolated application accepted:

- `DELETE /programs/projects/other-institution-project` — HTTP 200 and the delete service was invoked.
- `POST /programs` — HTTP 201 and the programme creation service was invoked.
- `PATCH /bottlenecks/other-institution-issue` with `status: resolved` — HTTP 200 and the status update service was invoked.

The global role guard allows authenticated requests when no `@Roles` policy exists. These services do not receive the caller and therefore cannot enforce ownership or institution scope themselves. The frontend's navigation and button permissions do not protect direct API requests.

Source review shows the same pattern on project creation and editing, milestone creation, bottleneck creation and learning-log creation. Data-submission creation has membership checks but no provider role gate; `READ_ONLY_USER` is considered unscoped by the shared membership helper. Those additional paths were reviewed but not all individually reproduced over HTTP.

**Impact:** unauthorized edits, creation or deletion of records used by the executive dashboard; potential loss of project records and cascading child records.

**Recommendation:** define explicit backend permissions for every mutation. Keep read-only and oversight roles out of write operations. Apply institution or project ownership checks where required. Add negative tests for every role, including multi-role users and users without an institution.

**Verification after fixing:** read-only requests must receive 403 before mutation services or database operations run; permitted operators must still succeed.

### F02 — Submission decisions bypass institution isolation

**Affected active implementation:** `src/modules/data-submissions/data-submissions.service.ts:544` and its single/bulk decision routes.

Submission lists and detail reads apply `scopeInstitutionFilter(user)`. The decision operation instead loads the submission using only `{ id }`, checks self-review and workflow state, then writes the decision. A reviewer belonging to institution A successfully rejected a pending submission belonging to institution B in the controlled service test.

The bulk decision route reuses the same operation, so the missing institution check applies there too. Approvals follow the same authorization path and can publish KPI values; the reproduction used rejection and empty fixture items to avoid any actual publication.

Entry/upload definition reads also load obligations by identifier without receiving the caller. They can reveal another institution's reporting metadata to authenticated users. Actual submission creation has a membership check, so this read gap should not be confused with a complete absence of write-side scoping.

The older `SubmissionsService` contains a similar flaw and its service reproduction also succeeded. **Its module is not imported by the current AppModule**, so its old HTTP routes are not counted as an active exposed surface. Retire or fix that code before enabling it.

**Impact:** unauthorized cross-institution decisions and potentially incorrect KPI publication, despite institution-scoped list views.

**Recommendation:** apply the caller's scope to the initial submission lookup and enforce it within the transaction. Check reviewer assignment if that is part of the intended workflow. Use the same object-level policy for detail, decision, bulk decision and obligation-definition routes.

**Verification after fixing:** foreign identifiers should return 403 or 404 consistently, and bulk responses must not publish foreign submissions. If reviewers are intended to work nationally, represent that explicitly in their assigned scope instead of leaving list and mutation policies inconsistent.

### F03 — Saved reports can be deleted without an appropriate permission

**Affected:** `src/modules/reports/reports.controller.ts` and `reports.service.ts:229`.

An active read-only JWT received HTTP 204 for `DELETE /reports/saved/another-users-report`. The service accepts only the report identifier and deletes the record without caller or ownership checks.

The current saved-report library is shared and deduplicated by configuration. Consequently, an ownership-only fix may not match the intended product behavior. The confirmed issue is that a read-only account has delete capability; whether only the creator or authorized shared-library managers should delete is a product policy decision.

**Impact:** unauthorized removal of saved report records, including records requested by other users.

**Recommendation:** gate deletion with an explicit management permission and define the ownership/shared-library rule. Review generation and export permissions separately.

### F04 — Password reset does not terminate existing sessions

**Affected:** `src/modules/auth/auth.service.ts:173`.

Reset changes the password and marks the reset token used. It does not increment `tokenVersion` or revoke refresh tokens. After reset, the real JWT strategy still accepted the old token version in the controlled test; no refresh revocation call occurred.

**Impact:** a stolen access token remains usable until expiry, and a valid stolen refresh token can continue obtaining access tokens after the owner resets the password. This undermines account recovery after credential theft.

**Recommendation:** atomically change the password, consume the reset token, increment the user's session version and revoke outstanding refresh sessions. Also invalidate other unused reset tokens as appropriate. Notify the account owner of the change.

**Verification after fixing:** both an access token and a refresh cookie issued before reset must be rejected immediately afterward.

### F05 — Reset can override administrative suspension

**Affected:** `src/modules/auth/auth.service.ts:173` and `src/modules/administration/users/users.service.ts` (`setStatus`).

Every successful set-password operation writes `status: ACTIVE`. It does not check whether the account was suspended after the link was issued. Administrator status updates do not invalidate outstanding reset tokens. A holder of a still-valid link can therefore reset the password and reverse the suspension.

**Impact:** an administrative account disablement can be bypassed during the reset-token validity window.

**Recommendation:** distinguish invitation activation from password recovery. Permit pending-account activation only for a valid invitation purpose, and never reactivate a suspended account through an ordinary reset. Revoke sessions and outstanding recovery tokens on suspension. Enforce the allowed account state atomically when consuming the token.

### F06 — Refresh rotation permits concurrent reuse

**Affected:** `src/modules/auth/auth.service.ts:108`.

Rotation performs a read/check, an unconditional revoke update and a new-token creation as separate operations. Two concurrent requests were scheduled to read the same valid record before either revoked it; both succeeded and issued different successor refresh tokens.

Sequential replay is checked, but the single-use property is not atomic. Password-reset token consumption follows a similar read-before-update structure and should receive its own database-backed concurrency test; that second race was not reproduced here.

**Impact:** a stolen or concurrently reused refresh cookie can establish more than one successor session. Partial failures can also leave session state inconsistent.

**Recommendation:** consume the old token with a conditional update that succeeds once, and create its successor in the same transaction. Consider token-family tracking and family revocation on detected replay.

### F07 — Webhooks bypass event isolation

**Affected:** `src/notifications/webhooks/webhooks.controller.ts`, `webhooks.service.ts:15`, `webhooks.service.ts:55`, `src/notifications/notifications.consumer.ts`.

Any authenticated account can create a subscription for `submission.*` or `user.*`. Dispatch selects all active subscriptions matching the event pattern; it does not check the subscription owner's role, institution or authorization for the underlying object.

A controlled subscription owned by institution A received a payload identifying a submission from institution B. User-invitation events include account identifiers and email addresses. This is an event-metadata disclosure finding; the test does not demonstrate export of every submission's full data contents.

**Impact:** cross-institution leakage of workflow metadata, user emails and useful record identifiers. Those identifiers can assist exploitation of object-level authorization gaps.

**Recommendation:** restrict subscription management to approved integration administrators or explicitly scoped integration principals. Authorize each event against the recipient's scope, minimize payload fields and cap subscriptions/delivery concurrency. Do not grant broad event access simply because a user is authenticated.

### F08 — Webhook SSRF defense is incomplete

**Affected:** `src/notifications/webhooks/ssrf-guard.ts` and `webhooks.service.ts:76`.

The audit confirmed these unsafe primitives:

- The IP predicate allows `0.0.0.0`, `100.64.0.1`, `::`, and hexadecimal IPv4-mapped loopback/private forms such as `::ffff:7f00:1`.
- Destination validation checks one DNS lookup result. The request then resolves/connects separately rather than using a pinned validated destination.
- Delivery omits a redirect policy, leaving Fetch's automatic redirect behavior enabled. Redirect destinations are not revalidated.

Common loopback, RFC1918, link-local and IPv6 local ranges were rejected by the positive control tests. The existing protection is useful but incomplete.

**Impact:** an authenticated attacker may use allowed webhooks to make server-side requests to internal services through redirects, DNS changes or address representation gaps. Cloud metadata access or internal service compromise was **not** attempted or demonstrated on the deployed server. Actual impact depends on its network and reachable services.

**Recommendation:** prefer an approved destination allowlist. Normalize addresses using a maintained IP parser; reject non-public/special-use destinations; validate all A/AAAA results; pin the approved address for the connection while preserving TLS hostname verification; reject redirects or revalidate every hop; and use network-level egress controls. Keep response/time/size and concurrency limits.

### F09 — CORS trusts unrelated Vercel applications

**Affected:** `src/config/cors.ts:29` and credentialed CORS in `src/main.ts`.

The production origin check accepts any hostname ending in `.vercel.app`. An unrelated tenant's origin was accepted in the reproduction, even though the configured allowlist contained only the Mission 300 frontend.

**Impact:** the browser trust boundary includes applications outside the organization's control. This does not itself forge a JWT or bypass `SameSite=Lax` cookies; it expands exposure if credentials become available to such an origin or other cookie/session conditions change.

**Recommendation:** list exact approved deployment origins, keep preview authorization limited to controlled projects/environments, require HTTPS and avoid broad provider-wide wildcard trust.

### F10 — Upload content is not verified

**Affected:** `src/files/files.service.ts:36`; related logo handling in the branding service.

A buffer containing non-PDF script text was accepted when its client-supplied filename ended in `.pdf` and its MIME type was `application/pdf`. Extension and MIME allowlists do not establish the content's actual format, and those two allowlists are not checked as a strict format pair.

Generic downloads are attachments and ownership checks work. **The reproduction is not evidence of server-side execution or browser XSS.** The concern is that the platform stores and distributes files whose metadata can misrepresent their contents. Office files may also contain harmful active content.

Logo uploads similarly trust `image/*` and allow SVG content without sanitization. Default Helmet CSP mitigates common inline-script payloads; a deployed browser exploit was not established.

**Recommendation:** check real file signatures and expected format pairs, constrain image formats and decode/re-encode raster images, sanitize or reject SVG, add malware scanning/quarantine according to evidence-file requirements, normalize download filenames and apply per-user storage quotas. Preserve attachment delivery and `nosniff` protections.

### F11 — Logs retain session credentials

**Affected:** `src/app.module.ts:48` and `src/notifications/email/email.service.ts`.

The configured Pino HTTP defaults have no credential redaction. The installed logger test retained both a fake `Authorization: Bearer ...` header and a fake `refreshToken` cookie in captured output. No real credentials were used in the test.

When `RESEND_API_KEY` is absent, the email service also logs the first email link, which may contain a password-reset or invitation token. That fallback is not restricted to development.

**Impact:** people or systems with access to logs can obtain session credentials; under missing-email-key configuration they can also obtain account-recovery links. Actual deployed log retention/access policies were not verified.

**Recommendation:** redact authorization, cookies, set-cookie headers and sensitive token/password fields before logs are emitted. Never log recovery-link tokens outside an explicitly isolated development mode. Review retention and access, and treat existing credential-bearing logs as sensitive. Rotate exposed credentials and invalidate sessions where appropriate.

## Other risks requiring follow-up

These observations are not counted as additional confirmed findings:

1. **Resource exhaustion:** uploads are capped at 20 MB, but XLSX parsing loads the workbook in process without an explicit decompressed-size, row/cell or execution-time budget. Many list/report operations load complete result sets before application-side filtering/pagination. No ZIP bomb or destructive load test was performed. Add bounded parsing, worker isolation, database-side pagination, concurrency limits and quotas.
2. **Proxy-aware throttling:** the app uses in-memory per-IP throttling and does not configure Express proxy trust in the reviewed bootstrap. Behind a proxy, clients may share the proxy IP and exhaust each other's login allowance. Multi-instance or distributed brute-force protection is not established. Inspect real proxy settings; trust only the actual proxy; use a shared limiter if scaled.
3. **Authentication timing:** login skips Argon2 verification for missing/inactive users but performs it for active users with a wrong password. Forgot-password sends email only for existing active users. Generic response text is good, but timing may disclose account existence. This was identified by source review, not remotely measured. Use a dummy hash check and asynchronous recovery delivery where appropriate.
4. **Secrets on the VPS:** deployment writes environment files with a heredoc, without an explicit restrictive umask or chmod in that step. Their effective permissions depend on the host defaults. Backups also require restricted ownership, access and encryption policy. Check actual permissions before calling this a confirmed disclosure.
5. **Deployment identity:** SSH actions are pinned but do not specify a host fingerprint in the reviewed workflow. Pin the server host identity. Docker-group membership gives the deploy identity substantial host control; document and minimize that trust boundary.
6. **API documentation and health:** Swagger is registered unconditionally and its middleware is outside controller JWT guards. The public health route skips throttling and checks the database. Check reverse-proxy restrictions, minimize public diagnostics and bound health traffic at the edge.
7. **Institution contact metadata:** institution reads include data-custodian details for any authenticated user. Obligation-definition reads are not scoped. Decide which contact/reporting metadata is meant to be globally visible and enforce that choice consistently.
8. **Recovery and audit integrity:** event publication and database changes are not universally backed by a transactional outbox. Some audit failures can happen after a mutation has committed. Assess retry/idempotency behavior and protect audit retention against alteration.
9. **Defense in depth:** assess MFA for privileged accounts, explicit JWT algorithm/issuer/audience policies, database least privilege, network segmentation, secret rotation, backup restore testing, TLS/HSTS configuration and incident alerting. These are recommendations or unverified deployment properties, not claims that each control is absent.
10. **Source secret scan limitation:** current Git tracking shows only environment templates, and the sensitive environment/key filename history check returned no entries for the selected paths. `.gitignore` and `.dockerignore` exclude local environment files. A complete entropy/history scan was not completed. The final high-confidence tracked-secret scanner was blocked by automatic approval review's usage limit; it did not execute. Do not interpret the limited filename checks as proof that the repository history contains no secrets.

The staging administrator password supplied earlier in this conversation should be treated as disclosed and rotated through the appropriate recovery procedure. It is deliberately not repeated in this report. Session invalidation should accompany rotation, especially given F04 and F11.

## Controls that worked or were present

**Dynamically tested:** missing/malformed/wrong-key/expired/revoked-version JWT rejection; inactive/deleted account rejection; forbidden bottleneck deletion for a reader; self-review rejection; institution helper isolation; foreign generic-file download rejection; disallowed upload-extension rejection; unexpected DTO-field rejection; expired/used/missing recovery-token rejection; identify throttling; common private webhook address rejection; rejection of arbitrary non-Vercel origins and production localhost.

**Reviewed in source/configuration:** Argon2 password hashing; high-entropy reset/refresh token generation with hashes stored in the database; HttpOnly, Secure outside development and SameSite=Lax refresh cookies; Helmet; generic login/recovery messages; global whitelist validation; session-version revocation on logout; current decision updates guarded against already-decided submissions; public overview removing internal delivery status; notification ownership checks; storage path normalization checks; admin-only branding/KPI mutations; non-root runtime container; loopback-only API publication; database and broker ports not published in the production Compose file; persistent data volumes; pinned GitHub Actions; CI gate before image build; load-once reference imports; scheduled backups.

Presence in code is not proof of correct live configuration. Dependency advisories and controls should be checked continuously.

## Remediation order and acceptance criteria

**First: contain credential and integration exposure.** Redact logs, remove production recovery-token logging, assess and rotate disclosed credentials, review stored logs, and restrict webhook creation/delivery until recipient scope and SSRF protections are reliable.

**Next: close authorization gaps.** Establish a backend permission matrix, restrict operational mutations, enforce scope on submission decisions and their bulk equivalents, and define saved-report deletion policy. Acceptance requires deny tests for every unsupported role and foreign object identifier.

**Then: repair session recovery.** Atomically invalidate pre-reset sessions, preserve administrative suspension, distinguish invite/reset purposes, and make token consumption/rotation single-use under concurrent requests. Verify against PostgreSQL with parallel requests, not only mocked persistence.

**Then: harden boundaries and operations.** Tighten origins, verify upload content, bound parsing/query resources, configure proxy-aware throttling, protect environment/backup files, pin SSH identity and check production network/TLS controls.

**Before declaring the backend ready:** rerun all reproductions as negative security assertions, the existing unit and E2E suites, and adversarial tests against an isolated Node 24 deployment with real PostgreSQL/RabbitMQ. Verify headers, cookies, role/institution isolation, log redaction, SSRF egress and credential revocation through the actual proxy. Add those negative assertions to CI. This assessment does not provide a production penetration-test certification.

## Reproduction and artifacts

Run from the backend directory:

```powershell
pnpm exec jest --config security/jest-audit.json --runInBand --json --outputFile security/test-results.json
node security/inventory.cjs
pnpm audit --prod --json
pnpm audit --json
pnpm typecheck
pnpm test --runInBand --silent
```

Artifacts:

- `security/access.audit-spec.ts`: real-guard HTTP authorization, JWT, DTO and throttling checks.
- `security/session.audit-spec.ts`: recovery/session persistence and refresh concurrency reproductions.
- `security/data-access.audit-spec.ts`: review isolation and file access/content tests.
- `security/webhook.audit-spec.ts`: recipient scope, IP handling, redirect settings, DNS checks and CORS.
- `security/logging.audit-spec.ts`: fake credential-header retention.
- `security/test-results.json`: 46-test audit results.
- `security/route-inventory.json`: route metadata and registration notes.
- `security/dependency-audit.json`, `security/dependency-audit-all.json`: registry advisory results.
- `security/check-tracked-secrets.cjs`: a prepared, unexecuted high-confidence scanner that reports locations only. It is not a complete history/entropy scanner.

All assessment artifacts are local and uncommitted. No runtime source files were changed for this assessment.

## Security references

The recommendations align with [OWASP API5: Broken Function Level Authorization](https://api-security.owasp.org/editions/2023/en/0xa5-broken-function-level-authorization/), [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), and [OWASP SSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html). These references support the remediation principles; the vulnerability evidence comes from this repository and its local reproductions.
