import type { Capture } from '../polling/index';
import { pokemonName } from './catalog';

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
}

export interface SceneOptions {
  capture: Capture;
  sprite?: string;
  nonce: string;
  scriptUri: string;
  styleUri: string;
  cspSource: string;
  reducedMotion: boolean;
  demo: boolean;
  remoteArtwork: boolean;
}

export function renderSceneHtml(options: SceneOptions): string {
  const name = pokemonName(options.capture.pokemon.speciesId);
  const origin = `${options.capture.source.owner}/${options.capture.source.repository} #${options.capture.source.number}`;
  const attr = escapeHtml;
  const sprite = options.sprite?.startsWith('data:image/png;base64,')
    ? options.sprite
    : undefined;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${attr(options.cspSource)}; script-src 'nonce-${attr(options.nonce)}'; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
<link rel="stylesheet" href="${attr(options.styleUri)}"><title>PR Pokémon — ${attr(name)}</title></head>
<body><main id="scene" data-phase="encounter" data-name="${attr(name)}" data-motion="${options.reducedMotion ? 'reduced' : 'auto'}" data-demo="${options.demo}">
<header class="masthead"><span class="brand"><span class="brand-icon" aria-hidden="true">◈</span> PR POKÉMON</span><span class="mode">${options.demo ? 'DEMO · NOT SAVED' : 'CAPTURE SAVED'}</span></header>
<section class="console" aria-label="Retro Pokémon encounter and guaranteed capture">
<div class="console-top"><span>FIELD ENCOUNTER</span><span aria-hidden="true">● ● ●</span></div>
<div class="landscape">
<div class="cloud cloud-one" aria-hidden="true"></div><div class="cloud cloud-two" aria-hidden="true"></div>
<div class="hills" aria-hidden="true"></div><div class="ground" aria-hidden="true"></div>
<section class="species-card" aria-label="Encounter details"><h1>${attr(name)}</h1><div class="species-meta"><span>NO. ${String(options.capture.pokemon.speciesId).padStart(3, '0')}</span><span>WILD</span></div><div class="hp" aria-hidden="true"><span>HP</span><i></i></div><p>CAPTURE GUARANTEED</p></section>
<div class="platform" aria-hidden="true"></div>
<div class="pokemon"><img id="sprite" ${sprite ? `src="${attr(sprite)}"` : 'hidden'} alt="${attr(name)} sprite" width="192" height="192"><span id="sprite-fallback" ${sprite ? 'hidden' : ''} aria-label="Sprite unavailable">?</span></div>
<div class="capture-ball" aria-hidden="true"><span></span></div>
<div class="sparkles" aria-hidden="true"><i>✦</i><i>✦</i><i>✦</i></div>
<span class="field-number" aria-hidden="true">01 / KANTO</span>
</div>
<section class="dialogue"><span class="dialogue-marker" aria-hidden="true">▶</span><div><p id="caption" role="status" aria-live="polite">A wild ${attr(name)} appeared!</p><p id="detail">${options.demo ? 'Preview only. Your collection is unchanged.' : 'A new pull request. A new companion.'}</p></div></section>
<div class="controls"><button id="skip" type="button">Skip animation</button><button id="continue" type="button" disabled>Continue <span aria-hidden="true">↵</span></button></div>
</section>
<section class="capture-receipt" aria-label="Capture origin"><div><span class="eyebrow">${options.demo ? 'SAMPLE PULL REQUEST' : 'ORIGIN PULL REQUEST'}</span><p>${attr(origin)}</p></div><button id="open-pr" type="button" ${options.demo ? 'disabled' : ''}>Open PR ↗</button></section>
<footer><p>${options.demo ? 'This demo never creates a capture.' : 'Already saved locally. No merge needed. Closing this scene never loses your Pokémon.'}</p><p id="art-status">${sprite ? 'Sprite via PokéAPI · © The Pokémon Company' : options.remoteArtwork ? 'Sprite unavailable. The capture is safe.' : 'Remote artwork is disabled in settings.'}</p><button id="retry-artwork" type="button" ${options.remoteArtwork ? '' : 'disabled'}>Retry sprite</button><button id="close" type="button">Close scene</button></footer>
</main><script nonce="${attr(options.nonce)}" src="${attr(options.scriptUri)}"></script></body></html>`;
}
