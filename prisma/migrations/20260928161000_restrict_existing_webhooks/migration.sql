-- Existing subscriptions from non-admin or inactive accounts must stop
-- receiving events immediately on upgrade, before users recreate integrations.
UPDATE webhook_subscriptions AS subscription SET "isActive" = false
WHERE NOT EXISTS (
  SELECT 1 FROM users AS account WHERE account.id = subscription."ownerId"
    AND account.status = 'ACTIVE'
    AND ('SYSTEM_ADMINISTRATOR' = ANY(account.roles)
      OR (cardinality(account.roles) = 0 AND account.role = 'SYSTEM_ADMINISTRATOR'))
);
