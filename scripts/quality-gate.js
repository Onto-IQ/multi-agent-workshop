#!/usr/bin/env node
'use strict';

/**
 * Quality gate for Sales Insight. Six cases. Exit 0 when every case passes,
 * exit 2 when any case fails. The starter data and server are expected to
 * fail all six — turning this green is the work of the workshops.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { analyze } = require('../lib/inspect-data');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, '..');
const SERVER_PATH = path.join(ROOT, 'server.js');
const CSV_PATH = path.join(ROOT, 'data', 'dataset.csv');
const BOOT_TIMEOUT_MS = 8000;
const REQ_TIMEOUT_MS = 4000;

const outcomes = [];
let child = null;
let childLog = '';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function report(name, pass, detail) {
  outcomes.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

function request(method, route, body) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: route,
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        timeout: REQ_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          let parsed = false;
          try {
            json = JSON.parse(text);
            parsed = true;
          } catch {
            parsed = false;
          }
          done({ status: res.statusCode || 0, text, json, parsed, error: null });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(`timed out after ${REQ_TIMEOUT_MS}ms`)));
    req.on('error', (err) => done({ status: 0, text: '', json: null, parsed: false, error: err.message }));
    if (body) req.write(body);
    req.end();
  });
}

function portOpen() {
  return new Promise((resolve) => {
    const sock = net.connect({ host: HOST, port: PORT });
    const settle = (open) => {
      sock.destroy();
      resolve(open);
    };
    sock.setTimeout(500);
    sock.once('connect', () => settle(true));
    sock.once('error', () => settle(false));
    sock.once('timeout', () => settle(false));
  });
}

function childDead() {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

async function waitForPort() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await portOpen()) return true;
    if (childDead()) return false;
    await sleep(100);
  }
  return false;
}

function killChild() {
  if (!child || childDead()) return;
  try {
    child.kill('SIGKILL');
  } catch {
    // Already gone.
  }
}

async function stopServer() {
  if (!child || childDead()) return;
  killChild();
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && !childDead()) await sleep(50);
}

async function bootServer() {
  childLog = '';
  child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    childLog += chunk;
  });
  child.stderr.on('data', (chunk) => {
    childLog += chunk;
  });
  return waitForPort();
}

// Stop the server unconditionally and boot it again — used to prove that
// notes survive a restart (real persistence, not in-memory state).
async function restartServer() {
  await stopServer();
  child = null;
  return bootServer();
}

function countsText(counts) {
  return Object.keys(counts)
    .sort()
    .map((code) => `${code}=${counts[code]}`)
    .join(', ');
}

function skipServerCases(reason) {
  report('bad-json-does-not-crash', false, reason);
  report('summary-matches-valid-rows', false, reason);
  report('health-no-secrets', false, reason);
  report('notes-validation', false, reason);
  report('notes-persists', false, reason);
}

async function main() {
  let csvText = '';
  try {
    csvText = fs.readFileSync(CSV_PATH, 'utf8');
  } catch (err) {
    report('data-quality', false, `cannot read sales.csv (${err.message})`);
    skipServerCases('skipped');
    return 2;
  }

  const inspected = analyze(csvText);
  const qualityPass = inspected.violations.length === 0;
  report(
    'data-quality',
    qualityPass,
    qualityPass
      ? `0 violations, valid companies=${inspected.stats.companyCount}`
      : `${inspected.violations.length} violations: ${countsText(inspected.counts)}`
  );

  if (await portOpen()) {
    const reason = `port ${PORT} is already in use`;
    console.log(reason);
    skipServerCases(reason);
    return 2;
  }

  if (!(await bootServer())) {
    console.log(childLog.trim().slice(-500));
    skipServerCases('server never became reachable');
    return 2;
  }

  const bad = await request('POST', '/api/notes', 'not-json');
  await sleep(200);
  const alive = await request('GET', '/api/health');
  const crashPass = !childDead() && alive.status === 200 && alive.parsed && alive.json && alive.json.ok === true;
  report(
    'bad-json-does-not-crash',
    crashPass,
    `bad=${bad.error || bad.status}; health=${alive.error || alive.status}; dead=${childDead()}`
  );

  if (childDead()) {
    if (!(await restartServer())) {
      skipServerCasesExceptCrash('server did not restart after the crash check');
      return finish();
    }
  }

  const summary = await request('GET', '/api/summary');
  const expected = inspected.stats;
  const gotCapital = summary.parsed && summary.json ? Number(summary.json.totalCapital) : NaN;
  const gotCompanies = summary.parsed && summary.json ? Number(summary.json.companyCount) : NaN;
  const summaryPass =
    summary.status === 200 &&
    gotCapital === expected.totalCapital &&
    gotCompanies === expected.companyCount;
  report(
    'summary-matches-valid-rows',
    summaryPass,
    `serverCompanies=${gotCompanies} expected=${expected.companyCount} serverCapital=${gotCapital} expected=${expected.totalCapital}`
  );

  const health = await request('GET', '/api/health');
  const healthText = health.text || '';
  const noSecrets =
    health.status === 200 &&
    health.parsed &&
    health.json &&
    health.json.ok === true &&
    !healthText.includes('sk-') &&
    !healthText.includes('sampleToken');
  report(
    'health-no-secrets',
    noSecrets,
    `status=${health.status}; leaks=${/sk-|sampleToken/.test(healthText) ? 'yes' : 'no'}`
  );

  const badBody = await request('POST', '/api/notes', JSON.stringify({ nope: 1 }));
  const missingText = badBody.status === 400;
  const goodBody = await request('POST', '/api/notes', JSON.stringify({ text: 'gate-check' }));
  const created = goodBody.status === 201 || goodBody.status === 200;
  report(
    'notes-validation',
    missingText && created && !childDead(),
    `nope=${badBody.status} (want 400); text=${goodBody.status} (want 201); dead=${childDead()}`
  );

  const mark = `gate-persist-${Date.now()}`;
  const stored = await request('POST', '/api/notes', JSON.stringify({ text: mark }));
  let persisted = stored.status === 201 || stored.status === 200;
  if (persisted) {
    const readBack = await request('GET', '/api/notes');
    persisted = readBack.status === 200 && (readBack.text || '').includes(mark);
  }
  if (persisted) {
    // A note that only lives in memory dies here — the gate demands file
    // persistence that survives a fresh process.
    if (!(await restartServer())) {
      report('notes-persists', false, 'server did not come back for the persistence re-check');
      return finish();
    }
    const after = await request('GET', '/api/notes');
    persisted = after.status === 200 && (after.text || '').includes(mark);
  }
  report(
    'notes-persists',
    persisted,
    `post=${stored.status}; survives-restart=${persisted ? 'yes' : 'no'}`
  );

  return finish();
}

function skipServerCasesExceptCrash(reason) {
  report('summary-matches-valid-rows', false, reason);
  report('health-no-secrets', false, reason);
  report('notes-validation', false, reason);
  report('notes-persists', false, reason);
}

function finish() {
  const failed = outcomes.filter((ok) => !ok).length;
  console.log(
    failed === 0
      ? `quality gate: ${outcomes.length}/${outcomes.length} passed`
      : `quality gate: ${failed} of ${outcomes.length} cases failed`
  );
  return failed === 0 ? 0 : 2;
}

process.on('exit', killChild);
process.on('SIGINT', () => {
  killChild();
  process.exit(2);
});
process.on('SIGTERM', () => {
  killChild();
  process.exit(2);
});

main()
  .then((code) => stopServer().then(() => process.exit(code)))
  .catch((err) => {
    console.log(`quality gate aborted: ${err && err.stack ? err.stack : err}`);
    return stopServer().then(() => process.exit(2));
  });
