import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pokemonName } from '../../src/presentation/catalog';
import { SpriteLoader } from '../../src/presentation/sprites';
import { renderSceneHtml } from '../../src/presentation/webview';
import type { Capture } from '../../src/polling/index';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
const capture: Capture = {
  key: 'pr:v1:github.com/trainer/repo/1',
  capturedAt: '2026-11-07T12:00:00Z',
  pokemon: { speciesId: 25, algorithm: 'sha256-kanto-v1' },
  source: {
    key: 'pr:v1:github.com/trainer/repo/1',
    host: 'github.com',
    id: 1,
    owner: 'trainer',
    repository: 'repo',
    number: 1,
    url: 'https://github.com/trainer/repo/pull/1',
    detectedAt: '2026-11-07T12:00:00Z',
    accessMode: 'public',
    observedState: 'open',
  },
};

test('local species catalog covers every allocator result and preserves canonical names', () => {
  for (let i = 1; i <= 151; i++) assert.ok(pokemonName(i));
  assert.equal(pokemonName(25), 'Pikachu');
  assert.equal(pokemonName(121), 'Starmie');
  assert.equal(pokemonName(151), 'Mew');
  for (const id of [0, 152, -1, 1.5]) assert.throws(() => pokemonName(id));
});

test('sprite loader uses one fixed credential-free request per species and caches locally', async () => {
  let requests = 0;
  const loader = new SpriteLoader(async (url, options) => {
    requests++;
    assert.equal(
      url,
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
    );
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.headers, undefined);
    assert.ok(options?.signal);
    return new Response(pixel, { headers: { 'content-type': 'image/png' } });
  });
  const results = await Promise.all([loader.load(25), loader.load(25)]);
  assert.equal(results[0], `data:image/png;base64,${pixel.toString('base64')}`);
  assert.equal(results[1], results[0]);
  await loader.load(25);
  assert.equal(requests, 1);
  assert.throws(() => loader.load(152));
});

test('invalid, redirected, oversized or unavailable artwork fails safely and can be retried', async () => {
  const large = Buffer.from(pixel);
  large.writeUInt32BE(99999, 16);
  for (const response of [
    () =>
      new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    () => new Response('bad png', { headers: { 'content-type': 'image/png' } }),
    () => new Response(large, { headers: { 'content-type': 'image/png' } }),
    () =>
      new Response(pixel, {
        headers: { 'content-type': 'image/png', 'content-length': '999999' },
      }),
    () =>
      new Response(new Uint8Array(128 * 1024 + 1), {
        headers: { 'content-type': 'image/png' },
      }),
    () => new Response('', { status: 404 }),
    () => {
      throw new Error('Private network details');
    },
  ]) {
    let tries = 0;
    const loader = new SpriteLoader(async () => {
      tries++;
      return response();
    });
    assert.equal(await loader.load(1), undefined);
    assert.equal(await loader.load(1), undefined);
    assert.equal(tries, 2);
  }
});

test('webview escapes metadata and restricts scripts, images and all network access', () => {
  const html = renderSceneHtml({
    capture: {
      ...capture,
      source: { ...capture.source, repository: '</p><script>steal()</script>' },
    },
    nonce: 'abc123',
    scriptUri: 'vscode-resource:/capture.js',
    styleUri: 'vscode-resource:/capture.css',
    cspSource: 'vscode-resource:',
    sprite: 'https://evil.example/image.svg',
    reducedMotion: false,
    demo: false,
    remoteArtwork: false,
  });
  assert.ok(html.includes('Pikachu'));
  assert.ok(html.includes('&lt;script&gt;steal()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>steal()'));
  assert.ok(!html.includes('evil.example'));
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes('img-src data:'));
  assert.ok(html.includes("script-src 'nonce-abc123'"));
  assert.ok(!html.includes('unsafe-inline'));
  assert.ok(html.includes('Remote artwork is disabled'));
  assert.ok(!html.includes(capture.source.url));
});

function scene(reduced = false, hidden = false) {
  const messages: { type: string }[] = [];
  const nodes = new Map<
    string,
    {
      dataset: Record<string, string>;
      textContent: string;
      hidden: boolean;
      disabled: boolean;
      src: string;
      events: Map<string, () => void>;
      addEventListener: (event: string, callback: () => void) => void;
    }
  >();
  const get = (id: string) => {
    if (!nodes.has(id)) {
      const events = new Map();
      nodes.set(id, {
        dataset: {},
        textContent: '',
        hidden: false,
        disabled: true,
        src: '',
        events,
        addEventListener: (event, callback) => {
          events.set(event, callback);
        },
      });
    }
    return nodes.get(id)!;
  };
  get('scene').dataset = {
    name: 'Pikachu',
    motion: reduced ? 'reduced' : 'auto',
    demo: 'false',
    phase: 'encounter',
  };
  const timers: (() => void)[] = [];
  const documentEvents = new Map<string, () => void>();
  const windowEvents = new Map<string, (event: unknown) => void>();
  const document = {
    hidden,
    getElementById: get,
    addEventListener: (event: string, callback: () => void) =>
      documentEvents.set(event, callback),
  };
  runInNewContext(readFileSync('media/capture.js', 'utf8'), {
    acquireVsCodeApi: () => ({
      postMessage: (message: { type: string }) => messages.push(message),
    }),
    document,
    window: {
      matchMedia: () => ({ matches: false }),
      addEventListener: (event: string, callback: (event: unknown) => void) =>
        windowEvents.set(event, callback),
    },
    setTimeout: (callback: () => void) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout: () => {},
  });
  return { get, timers, messages, document, documentEvents, windowEvents };
}

test('scene plays encounter, throw, shake and guaranteed capture in order before continuing', () => {
  const ui = scene();
  assert.equal(ui.get('scene').dataset.phase, 'encounter');
  assert.equal(ui.messages[0]?.type, 'ready');
  for (const [i, phase] of ['throw', 'shake', 'captured'].entries()) {
    ui.timers[i]!();
    assert.equal(ui.get('scene').dataset.phase, phase);
  }
  assert.equal(ui.get('continue').disabled, false);
  assert.match(ui.get('caption').textContent, /Pikachu was caught/);
  ui.get('continue').events.get('click')!();
  assert.equal(ui.messages[1]?.type, 'dismiss');
});

test('skip and reduced motion produce immediate capture; hidden scenes do not start or acknowledge', () => {
  const reduced = scene(true);
  assert.equal(reduced.get('scene').dataset.phase, 'captured');
  assert.equal(reduced.timers.length, 0);
  const skipped = scene();
  skipped.get('skip').events.get('click')!();
  skipped.timers[0]!();
  assert.equal(skipped.get('scene').dataset.phase, 'captured');
  const hidden = scene(false, true);
  assert.equal(hidden.messages.length, 0);
  assert.equal(hidden.timers.length, 0);
  hidden.document.hidden = false;
  hidden.documentEvents.get('visibilitychange')!();
  assert.equal(hidden.messages[0]?.type, 'ready');
});

test('sprite retries accept only PNG data messages, never remote URLs or markup', () => {
  const ui = scene();
  const listener = ui.windowEvents.get('message')!;
  listener({ data: { type: 'sprite', uri: 'https://evil.example/' } });
  assert.equal(ui.get('sprite').src, '');
  listener({
    data: {
      type: 'sprite',
      uri: `data:image/png;base64,${pixel.toString('base64')}`,
    },
  });
  assert.ok(ui.get('sprite').src.startsWith('data:image/png;base64,'));
  ui.get('sprite').events.get('error')!();
  assert.equal(ui.get('sprite-fallback').hidden, false);
});
