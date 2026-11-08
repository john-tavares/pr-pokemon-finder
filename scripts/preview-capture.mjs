// Isolated browser preview of the exact production renderer. Never reads VS Code storage.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { renderSceneHtml } = require('../out/src/presentation/webview.js');
const { SpriteLoader } = require('../out/src/presentation/sprites.js');
const { renderPokedexHtml } = require('../out/src/collection/webview.js');
const { demoCollection } = require('../out/src/collection/demo.js');
const previewSprites = new Map();
if (!process.argv.includes('--offline')) {
  const loader = new SpriteLoader();
  await Promise.all(
    demoCollection().entries.map(async (item) => {
      const id = item.capture.pokemon.speciesId;
      const uri = await loader.load(id);
      if (uri) previewSprites.set(id, uri);
    }),
  );
}
const sprite = process.argv.includes('--offline')
  ? undefined
  : await new SpriteLoader().load(25);
const companionSprite = process.argv.includes('--offline')
  ? undefined
  : await new SpriteLoader().load(1, 'back');
const capture = {
  key: 'pr:v1:github.com/demo/example/25',
  capturedAt: '2026-11-07T12:00:00Z',
  pokemon: { speciesId: 25, algorithm: 'sha256-kanto-v1' },
  source: {
    key: 'pr:v1:github.com/demo/example/25',
    host: 'github.com',
    id: 25,
    owner: 'demo',
    repository: 'example',
    number: 25,
    url: 'https://github.com/demo/example/pull/25',
    detectedAt: '2026-11-07T12:00:00Z',
    accessMode: 'public',
    observedState: 'open',
  },
};
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4173');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(
      renderSceneHtml({
        capture,
        sprite: url.searchParams.has('offline') ? undefined : sprite,
        companionSprite: url.searchParams.has('offline')
          ? undefined
          : companionSprite,
        nonce: 'isolated-development-preview',
        scriptUri: '/capture.js',
        styleUri: '/capture.css',
        cspSource: "'self'",
        reducedMotion: url.searchParams.has('reduced'),
        demo: true,
        remoteArtwork: !!sprite,
      }),
    );
  } else if (url.pathname === '/pokedex') {
    const state = demoCollection();
    if (url.searchParams.has('empty')) state.entries = [];
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(
      renderPokedexHtml({
        state,
        page: 0,
        demo: true,
        remoteArtwork:
          !url.searchParams.has('offline') && previewSprites.size > 0,
        nonce: 'isolated-development-preview',
        scriptUri: url.searchParams.has('offline')
          ? '/pokedex.js?offline'
          : '/pokedex.js',
        styleUri: '/pokedex.css',
        cspSource: "'self'",
      }),
    );
  } else if (url.pathname === '/pokedex.js') {
    response.setHeader('Content-Type', 'application/javascript');
    const messages = url.searchParams.has('offline')
      ? []
      : [...previewSprites].map(([speciesId, uri]) => ({
          type: 'sprite',
          speciesId,
          uri,
        }));
    response.end(
      `window.previewMessages=[];window.acquireVsCodeApi=()=>({postMessage(message){window.previewMessages.push(message);if(message.type==='ready')setTimeout(()=>{for(const data of ${JSON.stringify(messages)})window.dispatchEvent(new MessageEvent('message',{data}));},10);}});\n${await readFile(new URL('../media/pokedex.js', import.meta.url), 'utf8')}`,
    );
  } else if (url.pathname === '/pokedex.css') {
    response.setHeader('Content-Type', 'text/css');
    response.end(
      await readFile(new URL('../media/pokedex.css', import.meta.url), 'utf8'),
    );
  } else if (url.pathname === '/capture.js') {
    response.setHeader('Content-Type', 'application/javascript');
    response.end(
      `window.previewMessages=[];window.acquireVsCodeApi=()=>({postMessage(message){window.previewMessages.push(message);if(message.type==='dismiss')document.body.dataset.dismissed='true';}});\n${await readFile(new URL('../media/capture.js', import.meta.url), 'utf8')}`,
    );
  } else if (url.pathname === '/VT323-Regular.ttf') {
    response.setHeader('Content-Type', 'font/ttf');
    response.end(
      await readFile(new URL('../media/VT323-Regular.ttf', import.meta.url)),
    );
  } else if (url.pathname === '/capture.css') {
    response.setHeader('Content-Type', 'text/css');
    response.end(
      await readFile(new URL('../media/capture.css', import.meta.url), 'utf8'),
    );
  } else {
    response.writeHead(404);
    response.end();
  }
});
server.listen(4173, '127.0.0.1', () =>
  console.log(
    'Isolated capture preview: http://127.0.0.1:4173 (Ctrl+C to stop)',
  ),
);
