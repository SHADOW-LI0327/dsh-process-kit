import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHubMapping, renderHubContext, resolveFeature, writeHubMapping } from '../lib/hub.mjs';

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
  console.log('✓ hub-tools：映射读写 / 默认 feature / context 渲染');
} finally {
  await rm(repo, { recursive: true, force: true });
}
