/**
 * sales-server.js — MCP stdio server for the Sales Insight app.
 * Real tools over data/sales.csv via lib/inspect-sales. stdout is JSON-RPC only.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { analyze, roundMoney, PROVINCE_REGION } = require(path.join(__dirname, '..', 'lib', 'inspect-sales'));

const SERVER_INFO = { name: 'sales-tools', version: '1.1.0' };
const CSV_PATH = path.join(__dirname, '..', 'data', 'sales.csv');

function inspect() {
  return analyze(fs.readFileSync(CSV_PATH, 'utf8'));
}

function toolText(text) {
  return { content: [{ type: 'text', text }] };
}

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function replyError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

const TOOLS = [
  {
    name: 'get_summary',
    description: 'Order count, total revenue, and revenue per channel computed from data/sales.csv (valid rows only).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_channel_totals',
    description: 'Revenue and order count per sales channel, sorted by revenue descending.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_province_totals',
    description: 'Revenue and order count per province, sorted by revenue descending.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'lookup_province',
    description: 'Returns the Thai sales region for a known province name.',
    inputSchema: {
      type: 'object',
      properties: { province: { type: 'string' } },
      required: ['province'],
    },
  },
];

function handleCall(id, name, args) {
  if (name === 'get_summary') {
    const { stats } = inspect();
    return reply(id, toolText(JSON.stringify({
      orderCount: stats.orderCount,
      totalRevenue: stats.totalRevenue,
      byChannel: stats.byChannel,
    }, null, 2)));
  }
  if (name === 'get_channel_totals') {
    const { stats } = inspect();
    const totals = Object.entries(stats.byChannel)
      .map(([channel, revenue]) => ({ channel, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
    return reply(id, toolText(JSON.stringify(totals, null, 2)));
  }
  if (name === 'get_province_totals') {
    const byProvince = {};
    const orders = {};
    for (const row of inspect().asIsRows) {
      byProvince[row.province] = roundMoney((byProvince[row.province] || 0) + row.revenue);
      orders[row.province] = (orders[row.province] || 0) + 1;
    }
    const totals = Object.keys(byProvince)
      .map((province) => ({ province, orders: orders[province], revenue: byProvince[province] }))
      .sort((a, b) => b.revenue - a.revenue);
    return reply(id, toolText(JSON.stringify(totals, null, 2)));
  }
  if (name === 'lookup_province') {
    const province = String((args && args.province) ?? '').trim();
    const region = PROVINCE_REGION[province];
    if (!region) return reply(id, toolText('ไม่พบจังหวัด'));
    return reply(id, toolText(region));
  }
  return replyError(id, -32602, `Unknown tool: ${name}`);
}

function handle(req) {
  if (req.method === 'initialize') {
    return reply(req.id, {
      protocolVersion: req.params && req.params.protocolVersion ? req.params.protocolVersion : '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }
  if (req.method === 'notifications/initialized') return;
  if (req.method === 'ping') return reply(req.id, {});
  if (req.method === 'tools/list') return reply(req.id, { tools: TOOLS });
  if (req.method === 'tools/call') {
    const name = req.params && req.params.name;
    const args = (req.params && req.params.arguments) || {};
    return handleCall(req.id, name, args);
  }
  if (req.id !== undefined) return replyError(req.id, -32601, `Unknown method: ${req.method}`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    handle(JSON.parse(trimmed));
  } catch (err) {
    process.stderr.write(`sales-server: bad message: ${err.message}\n`);
  }
});
