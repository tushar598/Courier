#!/usr/bin/env node
// Pre-push guard: fail if any local secret value appears anywhere in git
// history (all commits, all blobs). Prints counts only, never values.
//
// Secrets checked: every non-trivial value in .env, plus any seed phrase in
// secrets/*.out (zipher-cli `wallet init` output).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const needles = [];

const envPath = `${root}.env`;
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    const value = m?.[2]?.replace(/^['"]|['"]$/g, '') ?? '';
    // Skip short or obviously public values (URLs, booleans, modes).
    if (value.length >= 12 && !/^https?:\/\//.test(value)) needles.push([`env:${m[1]}`, value]);
  }
}

const secretsDir = `${root}secrets`;
if (existsSync(secretsDir)) {
  for (const f of readdirSync(secretsDir).filter((f) => f.endsWith('.out'))) {
    const m = /"seed_phrase"\s*:\s*"([^"]+)"/.exec(readFileSync(`${secretsDir}/${f}`, 'utf8'));
    if (m?.[1]) needles.push([`seed:${f}`, m[1]], [`seed-first-6-words:${f}`, m[1].split(' ').slice(0, 6).join(' ')]);
  }
  const pass = `${secretsDir}/zipher-vault-pass`;
  if (existsSync(pass)) needles.push(['zipher-vault-pass', readFileSync(pass, 'utf8').trim()]);
}

// Full history, every patch, plus the current index and working tree of tracked files.
const history = execFileSync('git', ['log', '--all', '-p', '--no-color', '--full-history'], {
  cwd: root,
  maxBuffer: 512 * 1024 * 1024,
}).toString('utf8');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

let failures = 0;
for (const [label, value] of needles) {
  const inHistory = history.includes(value);
  const inTree = tracked.some((f) => {
    try {
      return readFileSync(`${root}${f}`, 'utf8').includes(value);
    } catch {
      return false;
    }
  });
  if (inHistory || inTree) {
    failures++;
    console.error(`LEAK ${label}: history=${inHistory} tracked=${inTree}`);
  }
}
const forbidden = tracked.filter((f) => /^(secrets\/|\.env$|\.env\.(?!example$))/.test(f));
for (const f of forbidden) console.error(`FORBIDDEN tracked file: ${f}`);

console.log(`checked ${needles.length} secret values against history + ${tracked.length} tracked files`);
if (failures || forbidden.length) process.exit(1);
console.log('OK: no secrets found');
