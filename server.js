'use strict';

/**
 * Registry Insight App — starter server (zero dependencies).
 * Run: node server.js
 *
 * The starter build is supposed to fail scripts/quality-gate.js.
 * Cleaning data/dataset.csv and fixing the request handler are the workshops.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';
const ROOT = __dirname;
const CSV_PATH = path.join(ROOT, 'data', 'dataset.csv');
const WEB_ROOT = path.join(ROOT, 'web');

// Sample value for the guardrails lab. It is not a live credential.
const SAMPLE_TOKEN = 'sk-sample-not-a-real-key';
const notes = [];

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function naiveRecords(text) {
  const lines = String(text).split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines.shift().split(',').map((cell) => cell.trim());
  return lines.map((line) => {
    const cells = line.split(',');
    const record = {};
    header.forEach((name, index) => {
      record[name] = (cells[index] || '').trim();
    });
    return record;
  });
}

function naiveMoney(value) {
  const parsed = parseFloat(String(value).replace(/฿/g, '').replace(/"/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function summaryFromCsv() {
  const text = fs.readFileSync(CSV_PATH, 'utf8');
  const records = naiveRecords(text);
  let totalCapital = 0;
  let companyCount = 0;
  for (const record of records) {
    const capital = naiveMoney(record.capital_raw);
    if (!record.reg_no) continue;
    totalCapital += capital;
    companyCount += 1;
  }
  return {
    companyCount,
    totalCapital: Math.round(totalCapital * 100) / 100,
    source: 'starter-parser',
  };
}

function contentType(filePath) {
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function serveStatic(res, fileName) {
  const resolved = path.resolve(WEB_ROOT, fileName);
  const rel = path.relative(WEB_ROOT, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  fs.readFile(resolved, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(resolved), 'Content-Length': buf.length });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, sampleToken: SAMPLE_TOKEN });
  }

  if (url.pathname === '/api/summary' && req.method === 'GET') {
    try {
      return sendJson(res, 200, summaryFromCsv());
    } catch (err) {
      console.error('summary failed', err);
      return sendJson(res, 500, { error: 'SUMMARY_FAILED' });
    }
  }

  if (url.pathname === '/api/notes' && req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      // Starter bug: invalid JSON throws and takes the process down.
      const body = JSON.parse(raw);
      notes.push({ text: String(body.text || '').slice(0, 200) });
      sendJson(res, 201, { ok: true, count: notes.length });
    });
    return;
  }

  if (req.method === 'GET') {
    if (url.pathname === '/' || url.pathname === '/index.html') return serveStatic(res, 'index.html');
    if (url.pathname === '/styles.css') return serveStatic(res, 'styles.css');
    if (url.pathname === '/app.js') return serveStatic(res, 'app.js');
  }

  sendJson(res, 404, { error: 'NOT_FOUND' });
});

server.listen(PORT, HOST, () => {
  console.log(`registry-insight listening on http://${HOST}:${PORT}`);
});
