import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubApiError } from '../../src/github/client';
import type {
  DiscoveryResult,
  DiscoveredPullRequest,
} from '../../src/github/discovery';
import {
  PollingController,
  type PollingStore,
} from '../../src/polling/controller';
import {
  decodeIndex,
  reconcilePolling,
  type PollingIndex,
} from '../../src/polling/index';

const start = '2026-11-07T12:00:00Z';
const later = '2026-11-07T12:02:00Z';
const before = '2026-11-01T12:00:00Z';
function pr(id: number, createdAt = later): DiscoveredPullRequest {
  return {
    host: 'github.com',
    id,
    owner: 'trainer',
    repository: 'repo',
    number: id,
    url: `https://github.com/trainer/repo/pull/${id}`,
    title: `PR ${id}`,
    state: 'open',
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
    mergedAt: null,
  };
}
function batch(
  items: DiscoveredPullRequest[],
  accountId = 123,
  complete = true,
): DiscoveryResult {
  return {
    account: { id: accountId, login: `trainer-${accountId}` },
    items,
    complete,
    totalCount: items.length,
  };
}
const empty = () => decodeIndex(undefined);
const enabled = { active: true, includePrivate: false, intervalSeconds: 60 };
class Store implements PollingStore {
  entries = new Map<number, unknown>();
  writes = 0;
  fail = false;
  read(id: number) {
    return this.entries.get(id);
  }
  async write(id: number, index: PollingIndex) {
    if (this.fail) throw new Error('private storage details');
    this.entries.set(id, structuredClone(index));
    this.writes++;
  }
}
class Timer {
  callbacks: { run: () => void; delay: number; canceled: boolean }[] = [];
  schedule = (run: () => void, delay: number) => {
    const item = { run, delay, canceled: false };
    this.callbacks.push(item);
    return {
      dispose: () => {
        item.canceled = true;
      },
    };
  };
  fire() {
    const item = this.callbacks.find((item) => !item.canceled);
    assert.ok(item);
    item.canceled = true;
    item.run();
  }
  get active() {
    return this.callbacks.filter((item) => !item.canceled);
  }
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('initial historical PRs establish a baseline without creating retroactive encounters', () => {
  const result = reconcilePolling(
    empty(),
    batch([pr(1, before)]),
    false,
    start,
  );
  assert.deepEqual(result.index.known, [1]);
  assert.deepEqual(result.added, []);
  assert.equal(result.index.baselines.public, start);
});

test('unknown new PRs automatically become pending encounters, including PRs closed between polls', () => {
  const baseline = reconcilePolling(
    empty(),
    batch([pr(1, before)]),
    false,
    start,
  ).index;
  const next = reconcilePolling(
    baseline,
    batch([pr(1, before), pr(2), { ...pr(3), state: 'closed' }]),
    false,
    later,
  );
  assert.equal(next.added.length, 2);
  assert.equal(next.added[0]?.id, 2);
  assert.equal(next.index.pending.length, 2);
  assert.equal(next.added[1]?.observedState, 'closed');
  assert.deepEqual(
    reconcilePolling(next.index, batch([pr(2)]), false, later).added,
    [],
  );
});

test('partial snapshots preserve missing known PRs and do not enqueue delayed historical records', () => {
  const baseline = reconcilePolling(
    empty(),
    batch([pr(1, before)]),
    false,
    start,
  ).index;
  const next = reconcilePolling(
    baseline,
    batch([pr(2, before), pr(3)], 123, false),
    false,
    later,
  );
  assert.deepEqual(next.index.known, [1, 2, 3]);
  assert.deepEqual(
    next.added.map((item) => item.id),
    [3],
  );
});

test('public/private baselines share known IDs so switching scope cannot duplicate encounters', () => {
  const first = reconcilePolling(empty(), batch([]), false, start).index;
  const publicIndex = reconcilePolling(
    first,
    batch([pr(1)]),
    false,
    later,
  ).index;
  const privateIndex = reconcilePolling(
    publicIndex,
    batch([pr(1), pr(2, before)]),
    true,
    later,
  );
  assert.deepEqual(privateIndex.added, []);
  assert.equal(privateIndex.index.pending.length, 1);
  assert.equal(privateIndex.index.baselines.private, later);
});

test('malformed and future-version indexes are rejected rather than reset', () => {
  for (const value of [
    null,
    {},
    { version: 2 },
    { version: 1, known: ['bad'], pending: [], baselines: {} },
  ]) {
    assert.throws(() => decodeIndex(value));
  }
  const index = reconcilePolling(empty(), batch([pr(1)]), false, start).index;
  assert.deepEqual(decodeIndex(index), index);
  assert.throws(() =>
    decodeIndex({
      ...index,
      pending: [{ ...index.pending[0], url: 'https://evil.example/' }],
    }),
  );
});

test('polling starts immediately and schedules the next cycle at sixty seconds after completion', async () => {
  const timer = new Timer();
  const store = new Store();
  let requests = 0;
  const controller = new PollingController(
    async () => {
      requests++;
      return batch([]);
    },
    store,
    () => {},
    timer.schedule,
  );
  controller.configure(enabled);
  await controller.pollNow();
  assert.equal(requests, 1);
  assert.equal(timer.active[0]?.delay, 60_000);
  timer.fire();
  await controller.pollNow();
  assert.equal(requests, 2);
  assert.equal(timer.active.length, 1);
  controller.dispose();
  assert.equal(timer.active.length, 0);
});

test('slow requests and manual checks share one in-flight cycle without overlapping timers', async () => {
  const timer = new Timer();
  let finish!: (value: DiscoveryResult) => void;
  let requests = 0;
  const controller = new PollingController(
    () => {
      requests++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    new Store(),
    () => {},
    timer.schedule,
  );
  controller.configure(enabled);
  const first = controller.pollNow();
  const second = controller.pollNow();
  await flush();
  assert.equal(first, second);
  assert.equal(requests, 1);
  assert.equal(timer.active.length, 0);
  finish(batch([]));
  await first;
  assert.equal(timer.active.length, 1);
  controller.dispose();
});

test('temporary API failures preserve durable state and schedule another attempt', async () => {
  const timer = new Timer();
  const store = new Store();
  let fail = false;
  const controller = new PollingController(
    async () => {
      if (fail) throw new GitHubApiError('network');
      return batch([pr(1, before)]);
    },
    store,
    () => {},
    timer.schedule,
    () => Date.parse(start),
  );
  controller.configure(enabled);
  await controller.pollNow();
  const saved = structuredClone(store.read(123));
  fail = true;
  await controller.pollNow();
  assert.deepEqual(store.read(123), saved);
  assert.equal(controller.status.knownCount, 1);
  assert.equal(controller.status.error, 'network');
  assert.equal(timer.active.length, 1);
  controller.dispose();
});

test('rate limits extend the next delay instead of opening consent prompts or retry loops', async () => {
  const timer = new Timer();
  let authRequests = 0;
  const controller = new PollingController(
    async () => {
      throw new GitHubApiError('rate-limited', 300);
    },
    new Store(),
    () => {
      authRequests++;
    },
    timer.schedule,
  );
  controller.configure(enabled);
  await controller.pollNow();
  assert.equal(timer.active[0]?.delay, 300_000);
  assert.equal(authRequests, 0);
  controller.dispose();
});

test('invalid sessions pause through the auth callback without automatic interactive login', async () => {
  const timer = new Timer();
  let invalidations = 0;
  const controller = new PollingController(
    async () => {
      throw new GitHubApiError('authentication-expired');
    },
    new Store(),
    () => {
      invalidations++;
      controller.configure({ ...enabled, active: false });
    },
    timer.schedule,
  );
  controller.configure(enabled);
  await controller.pollNow();
  assert.equal(invalidations, 1);
  assert.equal(controller.status.phase, 'paused');
  assert.equal(timer.active.length, 0);
  controller.dispose();
});

test('pause or disposal during a request discards late results and does not write storage', async () => {
  for (const dispose of [false, true]) {
    const store = new Store();
    const timer = new Timer();
    let finish!: (value: DiscoveryResult) => void;
    const controller = new PollingController(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      store,
      () => {},
      timer.schedule,
    );
    controller.configure(enabled);
    const request = controller.pollNow();
    await flush();
    if (dispose) controller.dispose();
    else controller.configure({ ...enabled, active: false });
    finish(batch([pr(1)]));
    await request;
    assert.equal(store.writes, 0);
    assert.equal(timer.active.length, 0);
  }
});

test('a new configuration waits for the old request to finish then runs without overlap', async () => {
  const timer = new Timer();
  const store = new Store();
  let finish!: (value: DiscoveryResult) => void;
  let requests = 0;
  const controller = new PollingController(
    async () =>
      ++requests === 1
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : batch([], 456),
    store,
    () => {},
    timer.schedule,
  );
  controller.configure(enabled);
  const previous = controller.pollNow();
  await flush();
  controller.configure({ ...enabled, includePrivate: true });
  finish(batch([pr(1)], 123));
  await previous;
  await controller.pollNow();
  assert.equal(store.read(123), undefined);
  assert.ok(store.read(456));
  assert.equal(requests, 2);
  controller.dispose();
});

test('a restored index catches PRs created while VS Code was closed without recreating old entries', async () => {
  const store = new Store();
  store.entries.set(
    123,
    reconcilePolling(empty(), batch([pr(1, before)]), false, start).index,
  );
  const timer = new Timer();
  const controller = new PollingController(
    async () => batch([pr(1, before), pr(2)]),
    store,
    () => {},
    timer.schedule,
    () => Date.parse(later),
  );
  controller.configure(enabled);
  await controller.pollNow();
  assert.equal(controller.pendingEncounters[0]?.id, 2);
  controller.dispose();
  const other = new PollingController(
    async () => batch([pr(2)]),
    store,
    () => {},
    timer.schedule,
    () => Date.parse(later),
  );
  other.configure(enabled);
  await other.pollNow();
  assert.equal(other.status.pendingCount, 1);
  other.dispose();
});

test('storage failures or unsupported schemas preserve existing data and publish no pending results', async () => {
  for (const corrupt of [false, true]) {
    const timer = new Timer();
    const store = new Store();
    store.fail = !corrupt;
    if (corrupt) store.entries.set(123, { version: 999 });
    const saved = store.read(123);
    const controller = new PollingController(
      async () => batch([pr(1)]),
      store,
      () => {},
      timer.schedule,
      () => Date.parse(start),
    );
    controller.configure(enabled);
    await controller.pollNow();
    assert.equal(controller.status.error, 'storage-error');
    assert.equal(store.read(123), saved);
    assert.deepEqual(controller.pendingEncounters, []);
    controller.dispose();
  }
});

test('public mode hides encounters detected in private mode while preserving the saved queue', async () => {
  const store = new Store();
  const timer = new Timer();
  store.entries.set(
    123,
    reconcilePolling(empty(), batch([pr(1)]), true, start).index,
  );
  const controller = new PollingController(
    async () => batch([]),
    store,
    () => {},
    timer.schedule,
    () => Date.parse(later),
  );
  controller.configure(enabled);
  await controller.pollNow();
  assert.equal(controller.pendingEncounters.length, 0);
  assert.equal(decodeIndex(store.read(123)).pending.length, 1);
  controller.dispose();
});

test('intervals are clamped and incomplete snapshots remain visibly partial', async () => {
  const timer = new Timer();
  const controller = new PollingController(
    async () => batch([], 123, false),
    new Store(),
    () => {},
    timer.schedule,
  );
  controller.configure({ ...enabled, intervalSeconds: 1 });
  await controller.pollNow();
  assert.equal(timer.active[0]?.delay, 60_000);
  assert.equal(controller.status.phase, 'partial');
  controller.dispose();
});
