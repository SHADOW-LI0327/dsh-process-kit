import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectHub, readHubMapping, renderHubContext, renderHubHealth, resolveFeature, writeHubMapping } from '../lib/hub.mjs';

const repo = await mkdtemp(join(tmpdir(), 'process-kit-hub-'));
try {
  assert.equal(await readHubMapping(repo), null);
  await assert.rejects(() => resolveFeature(repo), /no feature selected/);

  const path = await writeHubMapping(repo, { projectId: 'shop', featureId: 'FEAT-001' });
  assert.match(path, /docs\/process\/\.hub\.json$/);
  assert.deepEqual(await readHubMapping(repo), { projectId: 'shop', featureId: 'FEAT-001' });
  assert.equal(await resolveFeature(repo), 'FEAT-001');
  assert.equal(await resolveFeature(repo, 'FEAT-002'), 'FEAT-002');

  const text = renderHubContext({
    project: { id: 'shop', name: 'Shop' },
    feature: { id: 'FEAT-001', title: 'Refund', repos: ['web', 'api'], brief: 'partial refund' },
    statuses: [{ member: 'A', role: 'frontend', state: 'designing', focus: 'modal', updatedAt: new Date().toISOString(), stale: false }],
    questions: [{ id: 'q_1', author: 'A', status: 'open', text: 'approval?' }],
    artifacts: [{ id: 'art_1', kind: 'design', filename: 'refund.md', version: 1, author: 'A', summary: 'three states' }],
    events: [],
    cursor: 3,
  });
  assert.match(text, /Feature: FEAT-001/);
  assert.match(text, /A \(frontend\): designing/);
  assert.match(text, /q_1/);
  assert.match(text, /art_1/);

  process.env.COLLAB_CONFIG = join(repo, 'collab.json');
  await writeFile(process.env.COLLAB_CONFIG, JSON.stringify({ hubUrl: 'http://127.0.0.1:8787', token: 'col_test', name: 'A' }));
  const detection = await detectHub(repo);
  assert.equal(detection.configured, true);
  assert.equal(detection.projectId, 'shop');
  assert.equal(detection.featureId, 'FEAT-001');
  const healthText = renderHubHealth(detection, { ok: true, member: { name: 'A' }, project: { name: 'Shop' }, statuses: 1, artifacts: 2, questions: 3 });
  assert.match(healthText, /已连接/);
  assert.match(healthText, /1 个状态 \/ 2 个产物 \/ 3 个未决问题/);
  console.log('✓ hub-tools：映射读写 / 默认 feature / context 渲染 / 检测');
} finally {
  await rm(repo, { recursive: true, force: true });
}
