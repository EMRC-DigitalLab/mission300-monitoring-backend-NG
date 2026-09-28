// Exercises upgrade behavior using temporary tables only. Never uses app rows.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !['/codex_security_verify', '/m300_test'].includes(new URL(url).pathname)) {
    throw Error('Use an isolated security/CI test database.');
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN; SET LOCAL search_path = pg_temp;');
    await client.query(`
      CREATE TEMP TABLE users (id TEXT PRIMARY KEY, status TEXT, "tokenVersion" INTEGER, role TEXT, roles TEXT[]);
      CREATE TEMP TABLE password_reset_tokens (id TEXT PRIMARY KEY, "userId" TEXT, "usedAt" TIMESTAMPTZ);
      CREATE TEMP TABLE webhook_subscriptions (id TEXT PRIMARY KEY, "ownerId" TEXT, "isActive" BOOLEAN);
      INSERT INTO users VALUES
        ('admin', 'ACTIVE', 4, 'SYSTEM_ADMINISTRATOR', '{}'),
        ('pending', 'PENDING', 2, 'READ_ONLY_USER', '{}'),
        ('suspended', 'SUSPENDED', 9, 'SYSTEM_ADMINISTRATOR', '{}'),
        ('demoted', 'ACTIVE', 1, 'SYSTEM_ADMINISTRATOR', '{READ_ONLY_USER}'),
        ('secondary', 'ACTIVE', 0, 'READ_ONLY_USER', '{READ_ONLY_USER,SYSTEM_ADMINISTRATOR}');
      INSERT INTO password_reset_tokens VALUES ('active-link','admin',NULL), ('invite-link','pending',NULL), ('suspended-link','suspended',NULL);
      INSERT INTO webhook_subscriptions VALUES ('admin-hook','admin',true), ('pending-hook','pending',true), ('suspended-hook','suspended',true), ('demoted-hook','demoted',true), ('secondary-hook','secondary',true);
    `);
    for (const name of ['20260928160000_recovery_token_scope', '20260928161000_restrict_existing_webhooks']) {
      const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations', name, 'migration.sql'), 'utf8')
        .replace(/^BEGIN;\s*/i, '').replace(/COMMIT;\s*$/i, '');
      await client.query(sql);
    }
    const tokens = (await client.query('SELECT id,purpose,"tokenVersion","usedAt" FROM password_reset_tokens ORDER BY id')).rows;
    assert.deepEqual(tokens.map(t => [t.id,t.purpose,t.tokenVersion,!!t.usedAt]), [
      ['active-link','RESET',4,false], ['invite-link','INVITE',2,false], ['suspended-link','RESET',9,true],
    ]);
    const hooks = (await client.query('SELECT id,"isActive" FROM webhook_subscriptions ORDER BY id')).rows;
    assert.deepEqual(hooks.map(h => [h.id,h.isActive]), [
      ['admin-hook',true], ['demoted-hook',false], ['pending-hook',false], ['secondary-hook',true], ['suspended-hook',false],
    ]);
    const result = { recoveryUpgradeCases: 3, webhookUpgradeCases: 5, passed: true, scope: 'Temporary tables in an isolated test database; transaction rolled back.' };
    fs.writeFileSync(path.join(__dirname, 'migration-remediation-results.json'), JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
