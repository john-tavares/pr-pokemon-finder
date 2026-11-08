import assert from 'node:assert/strict';
import test from 'node:test';
import { CollectionController } from '../../src/collection/controller';
import {
  capturePending,
  decodeIndex,
  type PollingIndex,
} from '../../src/polling/index';
import { pullRequestKey } from '../../src/github/identity';

export function ledger(): PollingIndex {
  const pending = ['public', 'private'].map((accessMode, i) => {
    const source = {
      host: 'github.com' as const,
      owner: 'trainer',
      repository: `repo-${i}`,
      number: 1,
    };
    return {
      ...source,
      key: pullRequestKey(source),
      id: i + 1,
      url: `https://github.com/trainer/repo-${i}/pull/1`,
      detectedAt: '2026-11-08T10:00:00Z',
      accessMode: accessMode as 'public' | 'private',
      observedState: 'closed' as const,
    };
  });
  return capturePending(
    {
      ...decodeIndex(undefined),
      known: pending.map((item) => item.key),
      pending,
    },
    '2026-11-08T10:00:00Z',
  );
}

test('global collection includes pending and closed-PR rewards before any animation', async () => {
  const index = ledger();
  const controller = new CollectionController(async () => index);
  await controller.refresh(true, 123, true);
  assert.equal(controller.state.entries.length, 2);
  assert.ok(
    controller.state.entries.every((item) => item.presentation === 'pending'),
  );
  await controller.refresh(true, 123, false);
  assert.equal(controller.state.entries.length, 1);
  assert.equal(index.captures.length, 2);
  const snapshot = controller.state;
  (snapshot.entries as unknown[]).length = 0;
  assert.equal(controller.state.entries.length, 1);
  const reopened = new CollectionController(async () => index);
  await reopened.refresh(true, 123, true);
  assert.equal(reopened.state.entries.length, 2);
});

test('sign-out, scope/account changes and stale loads cannot leak previous rewards', async () => {
  let finish: ((value: PollingIndex) => void) | undefined;
  const controller = new CollectionController(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = controller.refresh(true, 123, true);
  await controller.refresh(false, undefined, false);
  finish!(ledger());
  await request;
  assert.deepEqual(controller.state, { phase: 'signed-out', entries: [] });
  await controller.refresh(true, undefined, false);
  assert.equal(controller.state.phase, 'unverified');
  controller.dispose();
  await controller.refresh(true, 123, true);
  assert.equal(controller.state.entries.length, 0);
});

test('offline read failure preserves same-account view but never another account', async () => {
  let fails = false;
  const controller = new CollectionController(async () => {
    if (fails) throw Error('sensitive path or token');
    return ledger();
  });
  await controller.refresh(true, 123, true);
  fails = true;
  await controller.refresh(true, 123, true);
  assert.equal(controller.state.phase, 'error');
  assert.equal(controller.state.entries.length, 2);
  await controller.refresh(true, 456, true);
  assert.deepEqual(controller.state, { phase: 'error', entries: [] });
});
