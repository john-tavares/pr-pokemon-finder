(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const scene = document.getElementById('scene');
  const caption = document.getElementById('caption');
  const detail = document.getElementById('detail');
  const catchButton = document.getElementById('catch');
  const skip = document.getElementById('skip');
  const done = document.getElementById('continue');
  const demo = scene.dataset.demo === 'true';
  const reduced =
    scene.dataset.motion === 'reduced' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const name = scene.dataset.name.toUpperCase();
  let started = false;
  let capturing = false;
  let finished = false;
  const timers = [];
  const transition = (phase) => {
    if (finished || !capturing) return;
    scene.dataset.phase = phase;
    if (phase === 'throw') {
      caption.textContent = 'Você lançou uma POKé BALL!';
      detail.textContent = '';
    }
    if (phase === 'shake') caption.textContent = 'Um… dois… três…';
    if (phase === 'captured') {
      finished = true;
      caption.textContent = 'Isso! ' + name + ' foi capturado!';
      detail.textContent = demo ? 'Prévia, nada salvo.' : 'Salvo na coleção!';
      skip.hidden = true;
      done.hidden = false;
      done.disabled = false;
      document.getElementById('close').textContent = 'FECHAR';
      vscode.postMessage({ type: 'captured' });
    }
  };
  const cancelTimers = () => timers.forEach(clearTimeout);
  catchButton.addEventListener('click', () => {
    if (!started || capturing || finished) return;
    capturing = true;
    catchButton.disabled = true;
    catchButton.hidden = true;
    skip.hidden = false;
    vscode.postMessage({ type: 'catch' });
    transition('throw');
    if (reduced) transition('captured');
    else
      for (const [delay, phase] of [
        [900, 'shake'],
        [3100, 'captured'],
      ])
        timers.push(setTimeout(() => transition(phase), delay));
  });
  skip.addEventListener('click', () => {
    if (!capturing) return;
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
      'Sprites FireRed/LeafGreen via PokéAPI · © The Pokémon Company';
  });
  document.getElementById('sprite').addEventListener('error', () => {
    document.getElementById('sprite').hidden = true;
    document.getElementById('sprite-fallback').hidden = false;
    document.getElementById('art-status').textContent =
      'Sprite indisponível. Seu encontro está salvo.';
  });
  const start = () => {
    if (started || document.hidden) return;
    started = true;
    vscode.postMessage({ type: 'ready' });
    // No timer here: even reduced-motion users must explicitly choose CAPTURAR.
  };
  document.addEventListener('visibilitychange', start);
  window.addEventListener('pagehide', cancelTimers);
  start();
})();
