import type { CollectionState } from './controller';
import { escapeHtml as attr } from '../presentation/webview';
import { pokemonName } from '../presentation/catalog';

export const POKEDEX_PAGE_SIZE = 24;
export interface PokedexOptions {
  state: CollectionState;
  page: number;
  demo: boolean;
  remoteArtwork: boolean;
  nonce: string;
  cspSource: string;
  styleUri: string;
  scriptUri: string;
}

export function pagedEntries(state: CollectionState, page: number) {
  const last = Math.max(
    0,
    Math.ceil(state.entries.length / POKEDEX_PAGE_SIZE) - 1,
  );
  const current = Math.min(
    last,
    Math.max(0, Number.isSafeInteger(page) ? page : 0),
  );
  return {
    page: current,
    last,
    entries: state.entries.slice(
      current * POKEDEX_PAGE_SIZE,
      (current + 1) * POKEDEX_PAGE_SIZE,
    ),
  };
}

export function renderPokedexHtml(options: PokedexOptions): string {
  const { page, last, entries } = pagedEntries(options.state, options.page);
  const messages = {
    'signed-out': 'Entre no GitHub para abrir sua coleção local.',
    unverified:
      'Conclua uma sincronização para identificar sua conta. Nenhuma coleção foi apagada.',
    loading: 'Lendo sua coleção local…',
    ready: entries.length
      ? 'Cada PR é uma lembrança. Escolha um Pokémon para ver sua origem.'
      : 'Sua aventura começa com um novo PR após a primeira sincronização.',
    error:
      'Não foi possível ler o armazenamento. Seus dados não foram apagados. Tente atualizar.',
  };
  const tiles = entries
    .map((item, index) => {
      const capture = item.capture;
      const name = pokemonName(capture.pokemon.speciesId);
      return `<button type="button" class="entry ${index === 0 ? 'selected' : ''}" data-select="${attr(capture.key)}" aria-pressed="${index === 0}">
      <span class="entry-number">Nº${String(capture.pokemon.speciesId).padStart(3, '0')}</span>
      <span class="portrait"><img data-species="${capture.pokemon.speciesId}" hidden alt="${attr(name)} FireRed sprite" width="64" height="64"><span class="fallback" aria-hidden="true">?</span></span>
      <strong>${attr(name.toUpperCase())}</strong>
      <span class="source">${attr(capture.source.owner)}/${attr(capture.source.repository)} #${capture.source.number}</span>
      <span class="badge">${item.presentation === 'pending' ? 'ANIMAÇÃO PENDENTE' : 'REGISTRADO'}</span>
    </button>`;
    })
    .join('');
  const details = entries
    .map((item, index) => {
      const capture = item.capture;
      const name = pokemonName(capture.pokemon.speciesId);
      return `<section class="record" data-details="${attr(capture.key)}" ${index ? 'hidden' : ''} aria-label="Detalhes de ${attr(name)}">
      <div class="record-title"><span>Nº${String(capture.pokemon.speciesId).padStart(3, '0')}</span><h2>${attr(name.toUpperCase())}</h2></div>
      <div class="hero-sprite"><img data-species="${capture.pokemon.speciesId}" hidden alt="${attr(name)}" width="64" height="64"><span class="fallback" aria-hidden="true">?</span></div>
      <p class="saved">✓ RECOMPENSA SALVA</p>
      <dl><dt>PR DE ORIGEM</dt><dd>${attr(capture.source.owner)}/${attr(capture.source.repository)} #${capture.source.number}</dd>
      <dt>DATA DA CAPTURA (UTC)</dt><dd><time datetime="${attr(capture.capturedAt)}">${attr(capture.capturedAt.slice(0, 19).replace('T', ' '))}</time></dd>
      <dt>APRESENTAÇÃO</dt><dd>${item.presentation === 'pending' ? 'Pendente · o Pokémon já está salvo' : 'Concluída'}</dd>
      <dt>PR QUANDO DETECTADO</dt><dd>${capture.source.observedState === 'closed' ? 'Fechado' : 'Aberto'} · ${capture.source.accessMode === 'private' ? 'Consulta com acesso privado' : 'Consulta pública'}</dd></dl>
      <button type="button" class="primary" data-open="${attr(capture.key)}" ${options.demo ? 'disabled' : ''}>ABRIR PR NO GITHUB ↗</button>
      <p class="record-note">Merge ou fechamento do PR não remove este Pokémon.</p>
    </section>`;
    })
    .join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${attr(options.cspSource)}; font-src ${attr(options.cspSource)}; script-src 'nonce-${attr(options.nonce)}'; connect-src 'none'; base-uri 'none'; form-action 'none'">
    <link rel="stylesheet" href="${attr(options.styleUri)}"><title>PR Pokémon — Pokédex</title></head>
    <body><main class="pokedex"><header class="device-top"><div class="lamps" aria-hidden="true"><i></i><b></b><b></b><b></b></div><div class="brand">PR POKÉMON<span>${options.demo ? 'DEMO · NÃO SALVO' : 'COLEÇÃO LOCAL'}</span></div></header>
    <div class="device-heading"><div><span class="eyebrow">KANTO FIELD NOTES</span><h1>POKéDEX</h1></div><p>${options.state.entries.length} RECOMPENSAS<br><span>UMA AVENTURA, TODOS OS REPOSITÓRIOS</span></p></div>
    <div class="toolbar"><p role="status" aria-live="polite">${messages[options.state.phase]}</p><button id="refresh" type="button">ATUALIZAR</button></div>
    <div class="device-body"><section class="collection-screen" aria-label="Pokémon capturados"><div class="screen-heading"><span>REGISTROS DE CAPTURA</span><span>${page + 1} / ${last + 1}</span></div><div class="entries">${tiles || '<div class="empty"><span aria-hidden="true">◇</span><h2>NENHUM REGISTRO AQUI</h2><p>Recompensas são salvas antes da animação.<br>Não é necessário fazer merge.</p></div>'}</div><nav aria-label="Páginas da coleção"><button id="previous" type="button" ${page === 0 ? 'disabled' : ''}>◀ ANTERIOR</button><span>PÁGINA ${page + 1}</span><button id="next" type="button" ${page === last ? 'disabled' : ''}>PRÓXIMA ▶</button></nav></section>
    <aside class="detail-screen" aria-label="Origem da captura">${details || '<div class="empty"><h2>SEU PR, SUA HISTÓRIA</h2><p>Selecione um registro para consultar sua origem.</p></div>'}</aside></div>
    <footer><span>● GLOBAL POR CONTA · SEM BACKEND</span><p>${options.remoteArtwork ? 'Sprites FireRed/LeafGreen via PokéAPI · © The Pokémon Company. Imagens podem ficar indisponíveis.' : 'Arte remota desativada. Os nomes e registros funcionam offline.'}</p>${options.demo ? '<p>Dados de exemplo. Esta prévia nunca altera sua coleção.</p>' : ''}</footer>
    </main><script nonce="${attr(options.nonce)}" src="${attr(options.scriptUri)}"></script></body></html>`;
}
