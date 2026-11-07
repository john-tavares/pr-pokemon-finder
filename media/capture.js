(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const scene = document.getElementById('scene');
  const caption = document.getElementById('caption');
  const detail = document.getElementById('detail');
  const skip = document.getElementById('skip');
  const done = document.getElementById('continue');
  const demo = scene.dataset.demo === 'true';
  const reduced =
    scene.dataset.motion === 'reduced' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const name = scene.dataset.name;
  let finished = false;
  const timers = [];
  const transition = (phase) => {
    if (finished) return;
    scene.dataset.phase = phase;
    if (phase === 'throw') caption.textContent = `A perfect throw for ${name}!`;
    if (phase === 'shake') caption.textContent = 'One… two… three…';
    if (phase === 'captured') {
      finished = true;
      caption.textContent = `Gotcha! ${name} was caught!`;
      detail.textContent = demo
        ? 'Demo complete. Nothing was added to your collection.'
        : 'Added to your local collection. Keep building!';
      skip.hidden = true;
      done.disabled = false;
    }
  };
  const cancelTimers = () => timers.forEach(clearTimeout);
  skip.addEventListener('click', () => {
    cancelTimers();
    transition('captured');
  });
  const dismiss = () => {
    cancelTimers();
    vscode.postMessage({ type: 'dismiss' });
  };
  done.addEventListener('click', dismiss);
  document.getElementById('close').addEventListener('click', dismiss);
  document
    .getElementById('open-pr')
    .addEventListener('click', () => vscode.postMessage({ type: 'open-pr' }));
  document
    .getElementById('retry-artwork')
    .addEventListener('click', () =>
      vscode.postMessage({ type: 'retry-artwork' }),
    );
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismiss();
  });
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (
      !message ||
      message.type !== 'sprite' ||
      typeof message.uri !== 'string' ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(message.uri)
    )
      return;
    const img = document.getElementById('sprite');
    img.src = message.uri;
    img.hidden = false;
    document.getElementById('sprite-fallback').hidden = true;
    document.getElementById('art-status').textContent =
      'Sprite via PokéAPI · © The Pokémon Company';
  });
  const img = document.getElementById('sprite');
  img.addEventListener('error', () => {
    img.hidden = true;
    document.getElementById('sprite-fallback').hidden = false;
    document.getElementById('art-status').textContent =
      'Sprite unavailable. The capture is safe.';
  });
  // Start only while the panel is actually visible; background tabs do not acknowledge.
  let started = false;
  const start = () => {
    if (started || document.hidden) return;
    started = true;
    vscode.postMessage({ type: 'ready' });
    if (reduced) transition('captured');
    else
      for (const [delay, phase] of [
        [1400, 'throw'],
        [2200, 'shake'],
        [4400, 'captured'],
      ])
        timers.push(setTimeout(() => transition(phase), delay));
  };
  document.addEventListener('visibilitychange', start);
  window.addEventListener('pagehide', cancelTimers);
  start();
})();
