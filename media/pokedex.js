(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  for (const button of document.querySelectorAll('[data-select]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.select;
      for (const tile of document.querySelectorAll('[data-select]')) {
        const selected = tile.dataset.select === key;
        tile.classList.toggle('selected', selected);
        tile.setAttribute('aria-pressed', String(selected));
      }
      for (const record of document.querySelectorAll('[data-details]'))
        record.hidden = record.dataset.details !== key;
    });
  }
  for (const button of document.querySelectorAll('[data-open]'))
    button.addEventListener('click', () =>
      vscode.postMessage({ type: 'open-pr', key: button.dataset.open }),
    );
  document
    .getElementById('refresh')
    .addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  document
    .getElementById('previous')
    .addEventListener('click', () =>
      vscode.postMessage({ type: 'page', direction: -1 }),
    );
  document
    .getElementById('next')
    .addEventListener('click', () =>
      vscode.postMessage({ type: 'page', direction: 1 }),
    );
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (
      !message ||
      message.type !== 'sprite' ||
      !Number.isInteger(message.speciesId) ||
      typeof message.uri !== 'string' ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(message.uri)
    )
      return;
    for (const img of document.querySelectorAll('img[data-species]')) {
      if (Number(img.dataset.species) !== message.speciesId) continue;
      img.addEventListener(
        'error',
        () => {
          img.hidden = true;
          img.nextElementSibling.hidden = false;
        },
        { once: true },
      );
      img.src = message.uri;
      img.hidden = false;
      img.nextElementSibling.hidden = true;
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
