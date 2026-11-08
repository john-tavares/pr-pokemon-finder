import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilePollingStore } from '../../src/polling/file-store';
import { FilePresentationGate } from '../../src/presentation/gate';
import { decodeIndex } from '../../src/polling/index';

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'pr-pokemon-sync-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('read snapshots survive restart without rewriting or acknowledging captures', async (t) => {
  const directory = await fixture(t);
  const store = new FilePollingStore(directory, () => undefined);
  await store.update(123, decodeIndex);
  const path = join(directory, 'account-123.json');
  const before = await readFile(path, 'utf8');
  const reopened = new FilePollingStore(directory, () => undefined);
  const snapshot = await reopened.readSnapshot(123);
  assert.equal(snapshot.version, 3);
  (snapshot.known as string[]).push('local mutation');
  assert.deepEqual((await reopened.readSnapshot(123)).known, []);
  assert.equal(await readFile(path, 'utf8'), before);
  assert.deepEqual(await readdir(directory), ['account-123.json']);
  assert.deepEqual((await reopened.readSnapshot(456)).captures, []);
  assert.equal(await readFile(path, 'utf8'), before);
});

test('legacy read migrations remain non-destructive and unsupported files fail closed', async (t) => {
  const directory = await fixture(t);
  const legacy = { version: 1, known: [42], pending: [], baselines: {} };
  const store = new FilePollingStore(directory, () => legacy);
  assert.deepEqual((await store.readSnapshot(123)).legacyKnownIds, [42]);
  assert.deepEqual(await readdir(directory), []);
  const path = join(directory, 'account-123.json');
  await writeFile(path, '{"version":999}');
  await assert.rejects(store.readSnapshot(123));
  assert.equal(await readFile(path, 'utf8'), '{"version":999}');
});

test('atomic store migrates legacy only once and a second instance reads committed state', async (t) => {
  const directory = await fixture(t);
  const legacy = { version: 1, known: [1], pending: [], baselines: {} };
  const first = new FilePollingStore(directory, () => legacy);
  await first.update(123, (value) => decodeIndex(value));
  const second = new FilePollingStore(directory, () => {
    throw new Error('Legacy must not replace authoritative data');
  });
  const saved = await second.update(123, (value) => decodeIndex(value));
  assert.deepEqual(saved?.legacyKnownIds, [1]);
  assert.equal(saved?.version, 3);
  assert.deepEqual(await readdir(directory), ['account-123.json']);
  assert.equal(legacy.version, 1);
});

test('parallel window writers cannot overwrite one another; busy writer retries from latest state', async (t) => {
  const directory = await fixture(t);
  const stores = [
    new FilePollingStore(directory, () => undefined),
    new FilePollingStore(directory, () => undefined),
  ];
  const results = await Promise.allSettled(
    stores.map((store, i) =>
      store.update(123, (value) => {
        const index = decodeIndex(value);
        return { ...index, legacyKnownIds: [...index.legacyKnownIds, i + 1] };
      }),
    ),
  );
  assert.ok(results.some((result) => result.status === 'fulfilled'));
  for (let i = 0; i < results.length; i++) {
    if (results[i]?.status === 'rejected')
      await stores[i]!.update(123, (value) => {
        const index = decodeIndex(value);
        return { ...index, legacyKnownIds: [...index.legacyKnownIds, i + 1] };
      });
  }
  const saved = JSON.parse(
    await readFile(join(directory, 'account-123.json'), 'utf8'),
  );
  assert.deepEqual(saved.legacyKnownIds.sort(), [1, 2]);
});

test('transform failure and cancellation leave the durable snapshot unchanged and release locks', async (t) => {
  const directory = await fixture(t);
  const store = new FilePollingStore(directory, () => undefined);
  await store.update(123, decodeIndex);
  const path = join(directory, 'account-123.json');
  const before = await readFile(path, 'utf8');
  await assert.rejects(
    store.update(123, () => {
      throw new Error('Rejected transaction');
    }),
  );
  assert.equal(await store.update(123, () => undefined), undefined);
  assert.equal(await readFile(path, 'utf8'), before);
  assert.deepEqual(await readdir(directory), ['account-123.json']);
});

test('corrupt or unsupported durable snapshots never fall back to legacy or reset progress', async (t) => {
  const directory = await fixture(t);
  const store = new FilePollingStore(directory, () => undefined);
  const path = join(directory, 'account-123.json');
  for (const content of ['not JSON', '{"version":999}']) {
    await writeFile(path, content);
    await assert.rejects(store.update(123, decodeIndex));
    assert.equal(await readFile(path, 'utf8'), content);
    assert.deepEqual(await readdir(directory), ['account-123.json']);
  }
});

test('existing and orphan locks fail closed without deleting files owned by another writer', async (t) => {
  const directory = await fixture(t);
  const path = join(directory, 'account-123.json.lock');
  await writeFile(path, 'orphan or active writer');
  const store = new FilePollingStore(directory, () => undefined);
  await assert.rejects(store.update(123, decodeIndex));
  assert.equal(await readFile(path, 'utf8'), 'orphan or active writer');
  assert.deepEqual(await readdir(directory), ['account-123.json.lock']);
});

test('invalid account IDs and invalid transaction output are rejected without durable changes', async (t) => {
  const directory = await fixture(t);
  const store = new FilePollingStore(directory, () => undefined);
  for (const id of [0, -1, 1.5, Number.NaN])
    await assert.rejects(store.update(id, decodeIndex));
  await assert.rejects(
    store.update(123, () => ({ ...decodeIndex(undefined), known: ['bad'] })),
  );
  assert.deepEqual(await readdir(directory), []);
});

test('presentation gate permits only one scene per account across windows and releases after dismissal/failure', async (t) => {
  const directory = await fixture(t);
  const first = new FilePresentationGate(directory);
  const second = new FilePresentationGate(directory);
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const active = first.run(123, async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return true;
  });
  await ready;
  let shown = false;
  assert.equal(
    await second.run(123, async () => {
      shown = true;
      return true;
    }),
    false,
  );
  assert.equal(shown, false);
  assert.equal(await second.run(456, async () => true), true);
  release();
  assert.equal(await active, true);
  await assert.rejects(
    first.run(123, async () => {
      throw new Error('Presenter failed');
    }),
  );
  assert.equal(await second.run(123, async () => true), true);
  assert.deepEqual(await readdir(directory), []);
});
