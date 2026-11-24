import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../lib/index.js';

let mode = 'ready';
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  res.setHeader('content-type', 'application/json');
  if (url.pathname === '/api/me') {
    res.end(JSON.stringify({ member: { name: 'A' } }));
    return;
  }
  if (url.pathname === '/api/features/F/context') {
    res.end(JSON.stringify({
      project: { id: 'p', name: 'P' },
      feature: { id: 'F', title: 'Refund', owner: 'B' },
      statuses: [{ member: 'B', state: 'done' }],
      artifacts: mode === 'ready' ? [{ kind: 'contract', filename: 'refund.yaml', version: 1, summary: 'contract' }] : [],
      questions: [],
      events: [],
      cursor: 1,
    }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const dir = await mkdtemp(join(tmpdir(), 'hub-gate-'));
const repo = join(dir, 'repo');
await mkdir(join(repo, 'docs/process/input'), { recursive: true });
await writeFile(
  join(repo, 'docs/process/input/FEAT-001-需求核对件.md'),
  '---\nid: FEAT-001\nkind: requirement-check\nstatus: confirmed\ngate0: approved\ndependsOn: p/F@contract\n---\n\n# check\n',
);
const config = join(dir, 'collab.json');
await writeFile(config, JSON.stringify({ hubUrl: `http://127.0.0.1:${port}`, token: 'col_test', name: 'A' }));
process.env.COLLAB_CONFIG = config;

const tools = [];
const ctx = {
  effect: (fn) => { fn(); return () => {}; },
  tools: { register: (def) => { tools.push(def); return () => {}; } },
  systemPrompt: { section: () => () => {} },
  skills: { registerProvider: () => () => {} },
  inject: (_deps, cb) => cb(ctx),
};
apply(ctx);
const check = tools.find((tool) => tool.name === 'hub_gate_check');
const exec = { agent: { session: { header: { cwd: repo } } } };
try {
  const ready = await check.execute({ package: 'FEAT-001', gate: 'Gate1' }, exec);
  assert.match(ready.text, /READY/);
  assert.match(ready.text, /refund\.yaml/);

  mode = 'blocked';
  const blocked = await check.execute({ package: 'FEAT-001', gate: 'Gate1' }, exec);
  assert.match(blocked.text, /BLOCKED/);

  await new Promise((resolve) => server.close(resolve));
  const unknown = await check.execute({ package: 'FEAT-001', gate: 'Gate1' }, exec);
  assert.match(unknown.text, /UNKNOWN/);
  console.log('✓ hub-gate：READY / BLOCKED / UNKNOWN');
} finally {
  await new Promise((resolve) => server.close(resolve)).catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
