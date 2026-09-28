# Security remediation: F01–F11

Date: 28 September 2026. Repository: `mission300-monitoring-backend-NG`, working tree on `staging`, based on commit `5860fe170b607f6f6acc831e5f81d5b1d254e6d8`.

The original [assessment](REPORT.md) describes the pre-fix commit. This document records subsequent implementation changes. The fixes and migrations have been verified locally. These results do not establish that a remote deployment completed or that previously disclosed credentials were rotated.

## Completed phases

| Phase | Findings | Implementation |
| --- | --- | --- |
| 1 | F01–F03 | Server-side write permissions, institution checks for operational writes and submission decisions/definitions, and management permissions for the shared report library. |
| 2 | F04–F06 | Atomic password recovery and refresh rotation; reset/suspension invalidate access tokens, refresh tokens and recovery links; invitations are distinguished from password recovery. |
| 3 | F07 | Administrator-only integrations; active administrator ownership checked during dispatch; approved events and payload fields only; migration disables existing unauthorized subscriptions. |
| 4 | F08 | Non-public/special IP ranges rejected; all DNS answers checked; validated IP pinned to the connection; original Host/TLS identity retained; redirects never followed; bounded DNS/network waits. |
| 5 | F09 | Exact configured CORS origins; no Vercel tenant wildcard; malformed origins rejected; additional localhost permission limited to development. |
| 6 | F10 | File bytes and extension/MIME pair verified before persistence; PDF/image signatures, bounded DOCX/XLSX containers and CSV structure checked; executable SVG and legacy DOC/XLS uploads rejected. |
| 7 | F11 | HTTP log metadata allowlist removes credential headers, bodies, query values and response cookies; recursive audit redaction; recovery/invitation links never logged by the email fallback. |

## Authorization changes

- Administrators and dashboard managers manage programmes, the learning log and shared saved-report deletion. Report preview/generation permits administrators, dashboard managers and oversight users.
- Administrators, dashboard managers and institutional providers can write projects and create/update bottlenecks. Providers are restricted to their institution. Project ownership transfer requires permission for both the original and new owner. Updates/deletes also check the previously authorized owner in the database predicate.
- Operational ownership currently uses institution names. Providers must match the institution's exact name after trimming and case normalization. Abbreviations and unrelated aliases fail closed; managers can correct historical ownership labels.
- Submission decisions, including bulk decisions, and obligation definition reads enforce the existing institution policy. Transactional decisions check the institution again. Self-review protection remains in force.
- Saved reports remain a shared library rather than gaining a new per-user ownership model.

## Session and migration behavior

Password recovery updates the password, increments the user's session version, consumes the recovery token and revokes remaining refresh/recovery tokens in one transaction. Status changes also increment the session version and revoke refresh/recovery tokens. An old recovery token cannot reactivate a suspended account, including after the account is re-enabled.

Account updates serialize credential operations. Refresh-token consumption uses a conditional database update, so concurrent attempts with the same cookie produce exactly one successor. Login also rechecks its password/session snapshot inside the transaction, preventing a concurrent reset or suspension from leaving a new usable session.

Apply the two additive migrations using the established deployment migration step (`pnpm prisma:migrate:deploy`):

1. `20260928160000_recovery_token_scope`: adds recovery purpose/session-version fields, classifies outstanding pending-account links as invitations, and invalidates links for inactive/suspended accounts.
2. `20260928161000_restrict_existing_webhooks`: deactivates subscriptions owned by inactive or non-administrator accounts. Existing active administrator integrations remain eligible.

These migrations do not reset the database or reseed application records. All 26 migrations were applied successfully to an empty disposable PostgreSQL database during verification.

## Integration and upload compatibility

- Webhook creation/list/removal now requires `SYSTEM_ADMINISTRATOR`. An administrator only lists/removes their own subscriptions. Dispatch checks the owner's current effective role list and account status.
- Approved subscriptions: `submission.decision_recorded`, `submission.uploaded`, `submission.*`, `user.invited`, `user.*`, `report.ready`, `report.*`. Unknown events are suppressed, including future events until explicitly approved. Payloads contain only approved identifiers/decision fields and invitation recipient metadata; credentials and recovery URLs are excluded.
- Webhook redirects are recorded as failed delivery responses. Public IPv4 and native global IPv6 destinations are supported. IPv4-mapped IPv6, translation/tunnelling and reserved ranges are deliberately rejected. DNS responses containing even one blocked address are rejected. Receivers with several public addresses use the first validated address; automatic address failover is not implemented.
- Set each deployment environment's `CORS_ORIGIN` to its exact trusted frontend origins, for example `https://m300.energymrc.ng`. Add trusted preview origins explicitly, comma-separated. Deployment uses `FRONTEND_URL` as a fallback when the dedicated origin secret is unset and validates the resolved list before changing the server. A blank production/staging allowlist rejects browser origins. No-origin server-to-server requests retain their existing behavior.
- Generic uploads support PNG, JPEG, GIF, WebP, PDF, DOCX, XLSX and UTF-8 CSV. Logos support the four raster image formats. DOC/XLS must be converted to DOCX/XLSX. SVG uploads and historical SVG logo responses are rejected.
- Uploaded files are checked against actual buffer size, not claimed size. Generic files remain capped at 20 MiB and logos at 5 MiB. Office archives are limited to 1,000 entries, 10 MiB per decompressed entry, 50 MiB total and a compression ratio of 100; ZIP64, encryption, traversal paths and macro/embedded-active-content containers are rejected. Actual streamed inflation is counted so forged directory sizes cannot bypass the memory bounds.
- CSV checks enforce UTF-8, consistent rows, balanced quotes and bounded row/column/field sizes; executable spreadsheet formula prefixes and HTML/script content are rejected. Downloads retain attachment semantics with safe filename encoding and no-sniff/sandbox headers.
- Recovery email delivery now needs a configured email provider; disabling email delivery no longer prints a usable recovery link in any environment.

## Verification

Targeted checks passed for authorization, institution scope, reset/suspension, concurrent token consumption, webhook permissions/payloads, SSRF, CORS, uploads and log redaction. Real session integration tests ran against disposable PostgreSQL and an isolated RabbitMQ virtual host; application databases and message queues were not used for mutations or event consumption.

| Check | Result |
| --- | --- |
| Full unit suite | 417 tests passed across 18 suites. |
| Audit regression suite | 103 checks passed across five suites. Current tests assert rejection of the repaired attacks; the original reproduction results remain archived in `test-results.json`. |
| Full PostgreSQL/RabbitMQ integration suite | 126 tests passed across six suites, including four new real-database session-security checks. |
| Final affected upload/SSRF tests | 74 checks passed after the final lint/type corrections. |
| Production dependency audit | Zero reported advisories across 421 dependencies. |
| Deployment workflow | YAML parsed successfully; five valid/invalid origin-configuration fixtures passed for each deployment job. |
| TypeScript / production build | Passed. |
| ESLint | Passed with zero errors; 6,290 existing repository warnings remain. |
| Migration upgrade fixtures | Three recovery-link and five webhook-owner upgrade cases passed using temporary tables with rollback. |
| High-confidence staged-source secret scan | Zero candidate locations; no sensitive environment/key filenames found in the filename history check. This is not a full entropy or historical-blob scan. |

Machine-readable evidence: `unit-remediation-results.json`, `remediation-test-results.json`, `e2e-remediation-results.json`, `dependency-audit-remediation.json`, `migration-remediation-results.json`, `secret-scan-summary.json`. Local aggregate checks also include TypeScript, ESLint and the production build. ESLint's existing repository-wide warnings are not treated as security proof.

## Practical limits and operator follow-up

These fixes address the eleven reported findings. They are not a certification of the whole service. The original report's additional observations—such as structured submission parser resource limits, query pagination, proxy-aware throttling and host/backup/SSH controls—remain separate work.

File validation identifies allowed formats and rejects the demonstrated spoofing cases. It does not prove a file is malware-free, fully well-formed or safe to open in a desktop application; antivirus/CDR is not configured. Image/PDF checks verify signatures and terminal structure rather than fully decoding or sanitizing the files.

No live network exploit or destructive/load test was performed. SSRF transport tests use controlled DNS/socket stubs, with checks on the exact address and TLS/Host options sent to Node's HTTP client.

Previously recorded credentials cannot be removed from historical logs/backups by a code change. After deployment, rotate the previously disclosed staging administrator password and any exposed infrastructure credentials through the normal secure procedure, invalidate affected sessions, and review log/backup access and retention. The fixes prevent future logging exposure; they do not establish whether past credentials were used improperly.

Reference guidance used: [IANA IPv4 special-purpose registry](https://www.iana.org/assignments/iana-ipv4-special-registry), [IANA IPv6 special-purpose registry](https://www.iana.org/assignments/iana-ipv6-special-registry), [Node HTTP client documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html), [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
