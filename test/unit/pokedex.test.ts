import assert from 'node:assert/strict';
import test from 'node:test';
import { demoCollection } from '../../src/collection/demo';
import {
  renderPokedexHtml,
  pagedEntries,
  POKEDEX_PAGE_SIZE,
} from '../../src/collection/webview';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const options = {
  state: demoCollection(),
  page: 0,
  demo: false,
  remoteArtwork: false,
  nonce: 'safe-nonce',
  cspSource: 'vscode-webview:',
  scriptUri: 'vscode-webview:/pokedex.js',
  styleUri: 'vscode-webview:/pokedex.css',
};

test('Pokédex renders every persisted reward with source, date and independent presentation status', () => {
  const html = renderPokedexHtml(options);
  assert.equal((html.match(/data-select=/g) ?? []).length, 6);
  assert.match(html, /PIKACHU/);
  assert.match(html, /ANIMAÇÃO PENDENTE/);
  assert.match(html, /demo\/pokedex-ui #2/);
  assert.match(html, /Fechado · Público/);
  assert.match(html, /2026-11-08 12:00:00/);
  assert.match(html, /Merge ou fechamento/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /enable-command-uris|script-src 'nonce-safe-nonce'/);
  assert.ok(!html.includes('src="https://'));
});

test('Pokédex escapes metadata and provides clear signed-out, offline/error and empty views', () => {
  const state = demoCollection();
  const capture = state.entries[0]!.capture;
  const malicious = {
    ...capture,
    source: { ...capture.source, owner: '<script>alert(1)</script>' },
  };
  const html = renderPokedexHtml({
    ...options,
    state: {
      ...state,
      entries: [{ capture: malicious, presentation: 'pending' }],
    },
  });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>alert'));
  for (const phase of [
    'signed-out',
    'unverified',
    'loading',
    'error',
    'ready',
  ] as const) {
    const empty = renderPokedexHtml({
      ...options,
      state: { phase, entries: [] },
    });
    assert.match(empty, /NENHUM REGISTRO AQUI/);
    assert.match(empty, /Arte remota desativada/);
    assert.ok(!empty.includes('data-open='));
  }
});

test('pagination clamps malformed pages and only exposes the visible page to artwork loading', () => {
  const entries = Array.from(
    { length: 60 },
    (_, i) => options.state.entries[i % 6]!,
  );
  const state = { ...options.state, entries };
  assert.equal(pagedEntries(state, 0).entries.length, POKEDEX_PAGE_SIZE);
  assert.equal(pagedEntries(state, 999).page, 2);
  assert.equal(pagedEntries(state, 2).entries.length, 12);
  assert.equal(pagedEntries(state, Number.NaN).page, 0);
  assert.equal(pagedEntries(state, -4).page, 0);
});

test('client selects records by exact key and only forwards known action shapes', () => {
  type Element = {
    dataset: Record<string, string>;
    hidden: boolean;
    events: Record<string, () => void>;
    attributes: Record<string, string>;
    classList: { toggle: (name: string, value: boolean) => void };
    addEventListener: (type: string, fn: () => void) => void;
    setAttribute: (name: string, value: string) => void;
  };
  const element = (dataset: Record<string, string>): Element => ({
    dataset,
    hidden: false,
    events: {},
    attributes: {},
    classList: { toggle() {} },
    addEventListener(type, fn) {
      this.events[type] = fn;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  });
  const tiles = [element({ select: 'a' }), element({ select: 'b' })];
  const records = [element({ details: 'a' }), element({ details: 'b' })];
  const links = [element({ open: 'b' })];
  const ids = Object.fromEntries(
    ['refresh', 'previous', 'next'].map((id) => [id, element({})]),
  );
  const messages: unknown[] = [];
  const handlers: Record<string, (event: { data: unknown }) => void> = {};
  runInNewContext(readFileSync('media/pokedex.js', 'utf8'), {
    acquireVsCodeApi: () => ({
      postMessage: (data: unknown) => messages.push(data),
    }),
    document: {
      querySelectorAll: (selector: string) =>
        selector === '[data-select]'
          ? tiles
          : selector === '[data-details]'
            ? records
            : selector === '[data-open]'
              ? links
              : [],
      getElementById: (id: string) => ids[id],
    },
    window: {
      addEventListener: (
        name: string,
        fn: (event: { data: unknown }) => void,
      ) => {
        handlers[name] = fn;
      },
    },
  });
  tiles[1]!.events.click!();
  assert.equal(records[0]!.hidden, true);
  assert.equal(records[1]!.hidden, false);
  links[0]!.events.click!();
  ids.next!.events.click!();
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [
    { type: 'ready' },
    { type: 'open-pr', key: 'b' },
    { type: 'page', direction: 1 },
  ]);
  assert.doesNotThrow(() =>
    handlers.message!({
      data: {
        type: 'sprite',
        speciesId: 25,
        uri: 'https://evil.invalid/image',
      },
    }),
  );
});
