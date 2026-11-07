import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubApiError } from '../../src/github/client';
import { pullRequestKey } from '../../src/github/identity';
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
  capturePending,
  markPresentationShown,
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
  async update(
    id: number,
    transform: (value: unknown) => PollingIndex | undefined,
  ) {
    const next = transform(this.read(id));
    if (next) await this.write(id, next);
    return next;
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

test('two presenter windows cannot replay the same capture, including a stale local queue', async () => {
  const store = new Store();
  const timer = new Timer();
  let busy = false;
  const gate = {
    run: async (_id: number, work: () => Promise<boolean>) => {
      if (busy) return false;
      busy = true;
      try {
        return await work();
      } finally {
        busy = false;
      }
    },
  };
  const first = new PollingController(
    async () => batch([pr(1)]),
    store,
    () => {},
    timer.schedule,
    () => Date.parse(start),
  );
  const second = new PollingController(
    async () => batch([pr(1)]),
    store,
    () => {},
    timer.schedule,
    () => Date.parse(start),
  );
  first.configure(enabled);
  await first.pollNow();
  second.configure(enabled);
  await second.pollNow();
  let finish!: (displayed: boolean) => void;
  let displays = 0;
  const showing = first.presentNext(gate, async (capture, current) => {
    displays++;
    assert.ok(current());
    assert.equal(capture.key, pullRequestKey(pr(1)));
    return new Promise<boolean>((resolve) => {
      finish = resolve;
    });
  });
  await flush();
  assert.equal(
    await second.presentNext(gate, async () => {
      displays++;
      return true;
    }),
    false,
  );
  finish(true);
  assert.equal(await showing, true);
  assert.equal(
    await second.presentNext(gate, async () => {
      displays++;
      return true;
    }),
    false,
  );
  assert.equal(displays, 1);
  assert.equal(second.pendingCaptures.length, 0);
  assert.equal(decodeIndex(store.read(123)).presentations[0]?.status, 'shown');
  first.dispose();
  second.dispose();
});

test('discarded or interrupted scenes leave a persisted capture pending and never acknowledge another account', async () => {
  const store = new Store();
  const timer = new Timer();
  const controller = new PollingController(
    async () => batch([pr(1)]),
    store,
    () => {},
    timer.schedule,
    () => Date.parse(start),
  );
  const gate = {
    run: async (_id: number, work: () => Promise<boolean>) => work(),
  };
  controller.configure(enabled);
  await controller.pollNow();
  assert.equal(await controller.presentNext(gate, async () => false), false);
  assert.equal(
    decodeIndex(store.read(123)).presentations[0]?.status,
    'pending',
  );
  assert.equal(
    await controller.presentNext(gate, async (_capture, current) => {
      controller.configure({ ...enabled, active: false });
      assert.equal(current(), false);
      return true;
    }),
    false,
  );
  assert.equal(decodeIndex(store.read(123)).captures.length, 1);
  assert.equal(
    decodeIndex(store.read(123)).presentations[0]?.status,
    'pending',
  );
  controller.dispose();
});

test('capture and presentation intent are distinct and repeated snapshots preserve immutable rewards', () => {
  const first = capturePending(
    reconcilePolling(empty(), batch([pr(1)]), false, start).index,
    start,
  );
  assert.equal(first.pending.length, 0);
  assert.equal(first.captures.length, 1);
  assert.deepEqual(first.presentations, [
    { key: pullRequestKey(pr(1)), status: 'pending' },
  ]);
  const original = structuredClone(first.captures[0]);
  for (const state of ['open', 'closed', 'open'] as const) {
    const next = capturePending(
      reconcilePolling(
        first,
        batch([
          { ...pr(1), state, mergedAt: state === 'closed' ? later : null },
        ]),
        false,
        later,
      ).index,
      later,
    );
    assert.deepEqual(next.captures, [original]);
    assert.deepEqual(next.presentations, first.presentations);
  }
  assert.deepEqual(decodeIndex(JSON.parse(JSON.stringify(first))), first);
});

test('presentation acknowledgement persists once and never changes or removes its capture', () => {
  const first = capturePending(
    reconcilePolling(empty(), batch([pr(1)]), false, start).index,
    start,
  );
  const shown = markPresentationShown(first, pullRequestKey(pr(1)), later);
  assert.deepEqual(shown.captures, first.captures);
  assert.deepEqual(shown.presentations, [
    { key: pullRequestKey(pr(1)), status: 'shown', shownAt: later },
  ]);
  assert.deepEqual(
    markPresentationShown(shown, pullRequestKey(pr(1)), before),
    shown,
  );
  assert.equal(
    markPresentationShown(first, pullRequestKey(pr(2)), later),
    first,
  );
  assert.throws(() =>
    markPresentationShown(first, pullRequestKey(pr(1)), 'bad'),
  );
  const restored = decodeIndex(JSON.parse(JSON.stringify(shown)));
  assert.deepEqual(
    capturePending(
      reconcilePolling(restored, batch([pr(1)]), false, later).index,
      later,
    ),
    shown,
  );
});

test('v2 queued references migrate without backfilling historical known PRs', () => {
  const current = reconcilePolling(
    empty(),
    batch([pr(1), pr(2, before)]),
    false,
    start,
  ).index;
  const {
    captures: _captures,
    presentations: _presentations,
    ...old
  } = current;
  const migrated = capturePending(decodeIndex({ ...old, version: 2 }), later);
  assert.equal(migrated.captures.length, 1);
  assert.equal(migrated.captures[0]?.source.detectedAt, start);
  assert.equal(migrated.captures[0]?.key, pullRequestKey(pr(1)));
  assert.deepEqual(migrated.baselines, current.baselines);
});

test('v3 rejects corrupt, orphaned or duplicated capture/presentation records', () => {
  const index = capturePending(
    reconcilePolling(empty(), batch([pr(1)]), false, start).index,
    start,
  );
  const capture = index.captures[0]!;
  for (const change of [
    { captures: null },
    { presentations: null },
    { captures: [capture, capture] },
    { captures: [{ ...capture, key: pullRequestKey(pr(2)) }] },
    { captures: [{ ...capture, capturedAt: 'bad' }] },
    {
      captures: [{ ...capture, pokemon: { ...capture.pokemon, speciesId: 0 } }],
    },
    {
      captures: [
        { ...capture, pokemon: { ...capture.pokemon, algorithm: 'future' } },
      ],
    },
    { presentations: [] },
    { presentations: [...index.presentations, ...index.presentations] },
    { presentations: [{ key: pullRequestKey(pr(2)), status: 'pending' }] },
    { presentations: [{ key: capture.key, status: 'shown', shownAt: 'bad' }] },
    { pending: [capture.source] },
    { known: [] },
  ])
    assert.throws(() => decodeIndex({ ...index, ...change }));
  assert.throws(() => decodeIndex({ ...index, version: 999 }));
});

test('controller exposes captures only after commit and never replays acknowledged presentations after restart', async () => {
  const store = new Store();
  const timer = new Timer();
  const controller = new PollingController(
    async () => batch([pr(1)]),
    store,
    () => {},
    timer.schedule,
    () => Date.parse(start),
  );
  controller.configure(enabled);
  await controller.pollNow();
  const key = pullRequestKey(pr(1));
  assert.equal(controller.status.captureCount, 1);
  assert.equal(controller.pendingCaptures.length, 1);
  assert.equal(decodeIndex(store.read(123)).captures.length, 1);
  const copy = controller.pendingCaptures as unknown as {
    pokemon: { speciesId: number };
  }[];
  copy[0]!.pokemon.speciesId = 999;
  assert.notEqual(controller.pendingCaptures[0]?.pokemon.speciesId, 999);
  await controller.confirmPresentation(key);
  assert.equal(controller.pendingCaptures.length, 0);
  controller.dispose();
  const restored = new PollingController(
    async () => batch([{ ...pr(1), state: 'closed', mergedAt: later }]),
    store,
    () => {},
    timer.schedule,
    () => Date.parse(later),
  );
  restored.configure(enabled);
  await restored.pollNow();
  assert.equal(restored.status.captureCount, 1);
  assert.equal(restored.status.pendingCount, 0);
  restored.dispose();
});

test('failed capture/acknowledgement writes preserve durable rewards and pending presentation for retry', async () => {
  const store = new Store();
  const timer = new Timer();
  const controller = new PollingController(
    async () => batch([pr(1)]),
    store,
    () => {},
    timer.schedule,
    () => Date.parse(start),
  );
  store.fail = true;
  controller.configure(enabled);
  await controller.pollNow();
  assert.equal(controller.pendingCaptures.length, 0);
  assert.equal(store.read(123), undefined);
  store.fail = false;
  await controller.pollNow();
  const capture = structuredClone(decodeIndex(store.read(123)).captures[0]);
  store.fail = true;
  await assert.rejects(controller.confirmPresentation(pullRequestKey(pr(1))));
  assert.equal(controller.pendingCaptures.length, 1);
  assert.deepEqual(decodeIndex(store.read(123)).captures[0], capture);
  store.fail = false;
  await controller.confirmPresentation(pullRequestKey(pr(1)));
  assert.equal(controller.pendingCaptures.length, 0);
  controller.dispose();
});

test('account/scope changes hide captures and discard acknowledgements waiting on storage', async () => {
  const store = new Store();
  const timer = new Timer();
  const controller = new PollingController(
    async () => batch([pr(1)]),
    store,
    () => {},
    timer.schedule,
    () => Date.parse(start),
  );
  controller.configure(enabled);
  await controller.pollNow();
  const saved = structuredClone(store.read(123));
  let finish!: () => void;
  const update = store.update.bind(store);
  store.update = async (id, transform) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return update(id, transform);
  };
  const confirming = controller.confirmPresentation(pullRequestKey(pr(1)));
  controller.configure({ ...enabled, active: false });
  finish();
  await confirming;
  assert.equal(controller.pendingCaptures.length, 0);
  assert.equal(controller.status.captureCount, 0);
  assert.deepEqual(store.read(123), saved);
  controller.dispose();
});

test('same PR number across repositories stays distinct and repeat/case changes do not requeue', () => {
  const first = pr(1);
  const second = {
    ...pr(2),
    number: 1,
    repository: 'other',
    url: 'https://github.com/trainer/other/pull/1',
  };
  const initial = reconcilePolling(
    empty(),
    batch([first, second]),
    false,
    start,
  );
  assert.equal(initial.index.pending.length, 2);
  assert.notEqual(initial.index.pending[0]?.key, initial.index.pending[1]?.key);
  const restored = decodeIndex(JSON.parse(JSON.stringify(initial.index)));
  const repeated = reconcilePolling(
    restored,
    batch([{ ...first, id: 999, owner: 'TRAINER', title: 'renamed' }, second]),
    false,
    later,
  );
  assert.equal(repeated.index.known.length, 2);
  assert.equal(repeated.index.pending.length, 2);
  assert.deepEqual(repeated.added, []);
});

test('v1 migration preserves pending records, baselines and unseen legacy history', () => {
  const pending = reconcilePolling(empty(), batch([pr(1)]), true, start).index
    .pending[0]!;
  const { key: _key, host: _host, ...legacyPending } = pending;
  const legacy = {
    version: 1,
    known: [1, 2, 3],
    pending: [legacyPending],
    baselines: { private: start },
  };
  const migrated = decodeIndex(legacy);
  assert.equal(migrated.version, 3);
  assert.deepEqual(migrated.pending, [pending]);
  assert.deepEqual(migrated.legacyKnownIds, [2, 3]);
  assert.deepEqual(migrated.baselines, legacy.baselines);
  assert.equal(legacy.version, 1);
  const next = reconcilePolling(
    migrated,
    batch([pr(1), pr(2), pr(4)]),
    true,
    later,
  );
  assert.deepEqual(
    next.added.map((item) => item.id),
    [4],
  );
  assert.deepEqual(next.index.legacyKnownIds, [3]);
  assert.deepEqual(decodeIndex(next.index), next.index);
});

test('v2 rejects inconsistent keys, hosts, membership and duplicate pending entries', () => {
  const index = reconcilePolling(empty(), batch([pr(1)]), false, start).index;
  for (const change of [
    { known: ['bad'] },
    { known: [...index.known, ...index.known] },
    { legacyKnownIds: [1, 1] },
    { legacyKnownIds: ['1'] },
    { pending: [...index.pending, ...index.pending] },
    { pending: [{ ...index.pending[0], key: pullRequestKey(pr(2)) }] },
    { pending: [{ ...index.pending[0], host: 'evil.example' }] },
    { known: [] },
    { pending: [null] },
  ])
    assert.throws(() => decodeIndex({ ...index, ...change }));
});

test('initial historical PRs establish a baseline without creating retroactive encounters', () => {
  const result = reconcilePolling(
    empty(),
    batch([pr(1, before)]),
    false,
    start,
  );
  assert.deepEqual(result.index.known, [pullRequestKey(pr(1))]);
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
  assert.deepEqual(
    next.index.known,
    [1, 2, 3].map((id) => pullRequestKey(pr(id))),
  );
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

test('controller commits migrated history only after successful storage and preserves v1 on write failure', async () => {
  for (const fail of [false, true]) {
    const store = new Store();
    const legacy = {
      version: 1,
      known: [1, 2],
      pending: [],
      baselines: { public: start },
    };
    store.entries.set(123, structuredClone(legacy));
    store.fail = fail;
    const timer = new Timer();
    const controller = new PollingController(
      async () => batch([pr(1), pr(3)]),
      store,
      () => {},
      timer.schedule,
      () => Date.parse(later),
    );
    controller.configure(enabled);
    await controller.pollNow();
    if (fail) {
      assert.deepEqual(store.read(123), legacy);
      assert.equal(controller.status.error, 'storage-error');
      assert.equal(controller.pendingEncounters.length, 0);
    } else {
      const saved = decodeIndex(store.read(123));
      assert.equal(saved.version, 3);
      assert.deepEqual(saved.legacyKnownIds, [2]);
      assert.equal(controller.status.knownCount, 3);
      assert.deepEqual(
        controller.pendingEncounters.map((item) => item.id),
        [3],
      );
    }
    controller.dispose();
  }
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
  assert.equal(decodeIndex(store.read(123)).captures.length, 1);
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
