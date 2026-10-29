#!/usr/bin/env node
/**
 * Workshop-local machine check.
 * Run from this repo (C:\dev\multi-agent-workshop):
 *   node scripts/verify-setup.mjs
 *
 * The course repo has its own scripts/verify-setup.mjs that also looks for
 * this workshop via WORKSHOP_DIR. Prefer this script when you are already
 * inside the workshop folder so you are not guessing which repo to use.
 */

import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipClaude = process.argv.includes('--skip-claude');
const skipPrompt = skipClaude || process.argv.includes('--skip-claude-prompt');

const problems = [];

function note(message) {
  console.log(`OK   | ${message}`);
}

function warn(message) {
  console.log(`WARN | ${message}`);
}

function bad(message) {
  problems.push(message);
  console.log(`FAIL | ${message}`);
}

function parseVersion(text) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

function atLeast(found, minimum) {
  if (!found) return false;
  for (let i = 0; i < minimum.length; i += 1) {
    if (found[i] > minimum[i]) return true;
    if (found[i] < minimum[i]) return false;
  }
  return true;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    const settle = (open) => {
      sock.destroy();
      resolve(open);
    };
    sock.setTimeout(400);
    sock.once('connect', () => settle(true));
    sock.once('error', () => settle(false));
    sock.once('timeout', () => settle(false));
  });
}

function get(port, route) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: route, timeout: 4000 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function runNode(args, cwd, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, env });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('close', (code) => resolve({ code, stdout }));
  });
}

async function commandVersion(bin, args) {
  try {
    const result = await exec(bin, args, { windowsHide: true });
    return `${result.stdout || ''}${result.stderr || ''}`.trim();
  } catch {
    return null;
  }
}

function runProcess(bin, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: cwd || repo, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 45000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function main() {
  console.log(`verify-setup (workshop) · ${repo}`);

  if (existsSync(path.join(repo, 'Lessons'))) {
    bad('this folder looks like the course repo (has Lessons/). cd to the workshop app repo (C:\\dev\\multi-agent-workshop) and run again.');
  }

  if (existsSync(path.join(repo, 'server.js')) && existsSync(path.join(repo, 'package.json'))) {
    note('workshop app files found (server.js + package.json)');
  } else {
    bad('missing server.js or package.json — you are not in the workshop app root');
  }

  if (
    existsSync(path.join(repo, 'data', 'raw', 'dbd-2558.parquet'))
    && existsSync(path.join(repo, 'data', 'warehouse.duckdb'))
  ) {
    note('real dataset present (dbd-2558.parquet + warehouse.duckdb)');
  } else {
    bad('data incomplete: expected data/raw/dbd-2558.parquet and data/warehouse.duckdb — git pull or re-clone');
  }

  if (existsSync(path.join(repo, '.mcp.json'))) {
    warn('`.mcp.json` is present — day-1 starter should not have it (learners add MCP in Workshop 6). Remove if resetting to Initial.');
  } else {
    note('no project `.mcp.json` yet (expected on day 1)');
  }

  const nodeVersion = parseVersion(process.version);
  if (atLeast(nodeVersion, [20, 0, 0])) note(`node ${process.version}`);
  else bad(`node ${process.version} is below 20`);

  const gitText = await commandVersion('git', ['--version']);
  if (gitText) note(gitText);
  else bad('git is not on PATH');

  const duckText = await commandVersion('duckdb', ['--version']);
  if (duckText) note(`duckdb ${duckText}`);
  else bad('duckdb is not on PATH. Install the DuckDB CLI (see course SETUP.md)');

  const uvText = await commandVersion('uvx', ['--version']);
  if (uvText) note(`uvx ${uvText} (needed for DuckDB MCP in Workshop 6)`);
  else warn('uv/uvx is not on PATH — install before Workshop 6 (see course SETUP.md)');

  if (await portOpen(3000)) warn('port 3000 is in use. Stop that process or set PORT before npm start');
  else note('port 3000 is free');

  const appPort = await freePort();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: repo,
    env: { ...process.env, PORT: String(appPort) },
    stdio: 'ignore',
  });
  try {
    let status = 0;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && status !== 200) {
      try {
        status = await get(appPort, '/');
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (status === 200) note(`app homepage responded on port ${appPort}`);
    else bad('app server did not serve /');
  } finally {
    if (server.exitCode === null) server.kill('SIGKILL');
  }

  const gatePort = await freePort();
  const gate = await runNode(['scripts/quality-gate.js'], repo, { ...process.env, PORT: String(gatePort) });
  if (gate.code === 2 && gate.stdout.includes('FAIL | data-quality')) {
    note('starter quality gate exits 2 (intended Initial / day-1 state)');
  } else {
    bad(`starter quality gate expected exit 2 with data-quality FAIL, got exit ${gate.code}`);
  }

  if (skipClaude) {
    warn('skipped Claude Code checks (--skip-claude)');
  } else {
    const claudeText = await commandVersion('claude', ['--version']);
    const claudeVersion = parseVersion(claudeText || '');
    if (!claudeText) bad('claude is not on PATH. Install with: npm install -g @anthropic-ai/claude-code');
    else if (!atLeast(claudeVersion, [2, 1, 296])) bad(`${claudeText} is below 2.1.296. Run: claude update`);
    else note(claudeText.split('\n')[0]);

    if (!skipPrompt && claudeText && atLeast(claudeVersion, [2, 1, 296])) {
      const prompt = await runProcess('claude', ['-p', 'Reply with exactly: CLAUDE-OK'], repo);
      if (prompt.code === 0 && prompt.stdout.includes('CLAUDE-OK')) note('claude -p returned CLAUDE-OK');
      else bad('claude -p did not return CLAUDE-OK. Log in with claude, and unset ANTHROPIC_API_KEY if it overrides the class login.');
    } else if (skipPrompt) {
      warn('skipped claude -p (--skip-claude-prompt)');
    }
  }

  if (problems.length > 0) {
    console.log(`verify-setup (workshop): ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('verify-setup (workshop): passed');
  console.log('Tip: for the full two-repo course check, run node scripts/verify-setup.mjs inside the course repo (folder with Lessons/).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
