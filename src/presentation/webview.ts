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
  companionSprite?: string;
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
  const companion = options.companionSprite?.startsWith(
    'data:image/png;base64,',
  )
    ? options.companionSprite
    : undefined;
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${attr(options.cspSource)}; script-src 'nonce-${attr(options.nonce)}'; connect-src 'none'; font-src ${attr(options.cspSource)}; base-uri 'none'; form-action 'none'">
<link rel="stylesheet" href="${attr(options.styleUri)}"><title>PR Pokémon — ${attr(name)}</title></head>
<body><main id="scene" data-phase="encounter" data-name="${attr(name)}" data-motion="${options.reducedMotion ? 'reduced' : 'auto'}" data-demo="${options.demo}">
<header class="masthead"><span class="brand">PR POKÉMON</span><span class="mode">${options.demo ? 'DEMO · NOT SAVED' : 'ENCOUNTER SAVED'}</span></header>
<section class="console" aria-label="FireRed-style Pokémon encounter with manual capture">
<div class="landscape">
<section class="species-card" aria-label="Encounter details"><div class="name-row"><h1>${attr(name.toUpperCase())}</h1><span class="species-number">Nº${String(options.capture.pokemon.speciesId).padStart(3, '0')}</span></div><div class="hp" aria-hidden="true"><span>HP</span><i></i></div></section>
<div class="platform" aria-hidden="true"></div>
<div class="pokemon"><img id="sprite" ${sprite ? `src="${attr(sprite)}"` : 'hidden'} alt="${attr(name)} FireRed sprite" width="64" height="64"><span id="sprite-fallback" ${sprite ? 'hidden' : ''} aria-label="Sprite unavailable">?</span></div>
<div class="player-platform" aria-hidden="true"></div><div class="companion"><img ${companion ? `src="${attr(companion)}"` : 'hidden'} alt="Bulbasaur FireRed back sprite, decorative battle companion" width="64" height="64"></div>
<div class="trainer-card"><span>PR TRAINER</span><div class="trainer-note">CAPTURA GARANTIDA</div><div class="hp" aria-hidden="true"><span>HP</span><i></i></div></div>
<div class="capture-ball" aria-hidden="true"><span></span></div>
<div class="sparkles" aria-hidden="true"><i>✦</i><i>✦</i><i>✦</i></div>
</div>
<div class="battle-bottom"><section class="dialogue"><p id="caption" role="status" aria-live="polite">Um ${attr(name.toUpperCase())} selvagem apareceu!</p><p id="detail">O que você vai fazer?</p><span class="dialogue-marker" aria-hidden="true">▼</span></section>
<div class="controls" aria-label="Menu de ações"><button id="catch" type="button">CAPTURAR</button><button id="open-pr" type="button" ${options.demo ? 'disabled' : ''}>VER PR</button><button id="close" type="button">MAIS TARDE</button><button id="retry-artwork" type="button" ${options.remoteArtwork ? '' : 'disabled'}>SPRITE</button><button id="skip" type="button" hidden>PULAR ANIMAÇÃO</button><button id="continue" type="button" hidden disabled>CONTINUAR</button></div></div>
</section>
<section class="capture-receipt" aria-label="Capture origin"><span class="eyebrow">${options.demo ? 'PR DE EXEMPLO · NADA É SALVO' : 'PR DE ORIGEM'}</span><p>${attr(origin)}</p></section>
<footer><p>${options.demo ? 'Prévia: sua coleção não será alterada.' : 'Encontro salvo. Você pode capturar agora ou voltar depois, sem perder o Pokémon.'}</p><p id="art-status">${sprite ? 'Sprites FireRed/LeafGreen via PokéAPI · © The Pokémon Company' : options.remoteArtwork ? 'Sprite indisponível. Seu encontro está salvo.' : 'Remote artwork is disabled in settings.'}</p><p class="companion-note">Bulbasaur é apenas o acompanhante visual desta cena.</p></footer>
</main><script nonce="${attr(options.nonce)}" src="${attr(options.scriptUri)}"></script></body></html>`;
}
