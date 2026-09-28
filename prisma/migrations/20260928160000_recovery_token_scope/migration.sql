BEGIN;
ALTER TABLE password_reset_tokens
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'RESET',
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
-- Preserve valid outstanding invitations and recovery links, but never links
-- for suspended accounts. New links capture both purpose and session version.
UPDATE password_reset_tokens AS token SET
  purpose = CASE WHEN account.status = 'PENDING' THEN 'INVITE' ELSE 'RESET' END,
  "tokenVersion" = account."tokenVersion",
  "usedAt" = CASE WHEN account.status NOT IN ('ACTIVE', 'PENDING')
    THEN COALESCE(token."usedAt", now()) ELSE token."usedAt" END
FROM users AS account WHERE account.id = token."userId";
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_purpose_check
  CHECK (purpose IN ('RESET', 'INVITE'));
COMMIT;
