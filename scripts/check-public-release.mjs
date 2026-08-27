import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const required = ['LICENSE', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'TRADEMARKS.md'];
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const failures = [];
for (const file of required) if (!files.includes(file)) failures.push(`missing ${file}`);

const forbiddenPaths = /(^|\/)(node_modules|__pycache__|\.env|assets|content|catalog\/audio|catalog\/operations)(\/|$)|\.py[cod]$/i;
for (const file of files) if (forbiddenPaths.test(file) && !file.endsWith('.gitkeep')) failures.push(`private/generated path: ${file}`);

const highSignalSecrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/
];
const configuredCredential = /(?:api[_-]?key|session[_-]?secret|passcode)\s*[:=]\s*["'][^"']{8,}["']/i;
for (const file of files) {
  if (/\.(?:png|jpe?g|gif|webp|mp[34]|mov|wav|flac|zip)$/i.test(file)) failures.push(`binary media: ${file}`);
  let source;
  try { source = readFileSync(file, 'utf8'); } catch { continue; }
  if (highSignalSecrets.some((pattern) => pattern.test(source))) failures.push(`possible secret: ${file}`);
  if (!/(^|\/)test\//.test(file) && configuredCredential.test(source)) failures.push(`possible configured credential: ${file}`);
}

if (failures.length) {
  console.error(`Public release check failed:\n- ${[...new Set(failures)].join('\n- ')}`);
  process.exit(1);
}
console.log(`Public release check passed (${files.length} tracked files).`);
