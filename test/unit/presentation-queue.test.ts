import assert from 'node:assert/strict';
import test from 'node:test';
import { PresentationQueue } from '../../src/presentation/queue';

test('polling wakeups are serialized and manual resume is retained during an active scene', async () => {
  let release: (() => void) | undefined;
  let active = 0;
  let maximum = 0;
  const manual: boolean[] = [];
  const queue = new PresentationQueue(async (requestedManually) => {
    active++;
    maximum = Math.max(maximum, active);
    manual.push(requestedManually);
    if (manual.length === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    active--;
  });
  const first = queue.request();
  await Promise.resolve();
  const joined = queue.request(true);
  for (let i = 0; i < 20; i++) assert.equal(queue.request(), first);
  release!();
  await joined;
  assert.deepEqual(manual, [false, true]);
  assert.equal(maximum, 1);
});

test('dispose cancels queued wakeups without starting another scene', async () => {
  let release: (() => void) | undefined;
  let calls = 0;
  const queue = new PresentationQueue(async () => {
    calls++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const running = queue.request();
  await Promise.resolve();
  void queue.request(true);
  queue.dispose();
  release!();
  await running;
  await queue.request(true);
  assert.equal(calls, 1);
});

test('a failed drain releases its guard so an explicit retry can succeed', async () => {
  let fails = true;
  let calls = 0;
  const queue = new PresentationQueue(async () => {
    calls++;
    if (fails) throw Error('fixture');
  });
  await assert.rejects(queue.request());
  fails = false;
  await queue.request(true);
  assert.equal(calls, 2);
});
