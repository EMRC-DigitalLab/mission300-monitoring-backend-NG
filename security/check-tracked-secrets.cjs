// High-confidence patterns only. Prints locations, never matched values.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['stripe-live-key', /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ['resend-key', /\bre_[A-Za-z0-9]{24,}\b/],
];
const matches = [];
let scannedFiles = 0;
for (const file of files) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 1024 * 1024) continue;
  const buffer = fs.readFileSync(absolute);
  if (buffer.includes(0)) continue;
  scannedFiles++;
  buffer.toString('utf8').split(/\r?\n/).forEach((line, index) => {
    for (const [kind, pattern] of patterns) if (pattern.test(line)) matches.push({ file, line: index + 1, kind });
  });
}
const historicalSensitiveNames = execFileSync('git', ['log', '--all', '--name-only', '--pretty=format:', '--', '.env', '.env.development', '.env.staging', '.env.production', '*.pem', '*.key'], { cwd: root }).toString().split(/\r?\n/).filter(Boolean);
const summary = { scannedFiles, candidateLocations: matches, historicalSensitiveFilenames: [...new Set(historicalSensitiveNames)],
  limitations: 'Not an entropy scan or a complete scan of every historical blob; local env files are intentionally not read.' };
fs.writeFileSync(path.join(__dirname, 'secret-scan-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
