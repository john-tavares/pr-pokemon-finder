import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { CollectionController } from './controller';
import { renderPokedexHtml, pagedEntries } from './webview';
import { demoCollection } from './demo';
import { SpriteLoader } from '../presentation/sprites';

export function registerPokedex(
  context: vscode.ExtensionContext,
  collection: CollectionController,
): void {
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  const sprites = new SpriteLoader();
  let panel: vscode.WebviewPanel | undefined;
  let page = 0;
  let demo = false;
  let revision = 0;
  let disposed = false;
  const state = () => (demo ? demoCollection() : collection.state);
  const remoteArtwork = () =>
    vscode.workspace
      .getConfiguration('prPokemonFinder')
      .get<boolean>('presentation.remoteArtwork', true) === true;
  const render = () => {
    if (!panel) return;
    revision++;
    page = pagedEntries(state(), page).page;
    panel.webview.html = renderPokedexHtml({
      state: state(),
      page,
      demo,
      remoteArtwork: remoteArtwork(),
      nonce: randomBytes(24).toString('hex'),
      cspSource: panel.webview.cspSource,
      scriptUri: panel.webview
        .asWebviewUri(vscode.Uri.joinPath(media, 'pokedex.js'))
        .toString(),
      styleUri: panel.webview
        .asWebviewUri(vscode.Uri.joinPath(media, 'pokedex.css'))
        .toString(),
    });
  };
  const loadArtwork = async () => {
    const target = panel;
    const current = revision;
    if (!target || !remoteArtwork()) return;
    const species = [
      ...new Set(
        pagedEntries(state(), page).entries.map(
          (item) => item.capture.pokemon.speciesId,
        ),
      ),
    ];
    // Bounded workers; even large collections only request the visible page.
    const worker = async () => {
      while (
        species.length &&
        !disposed &&
        target === panel &&
        current === revision
      ) {
        const speciesId = species.shift()!;
        const uri = await sprites.load(speciesId);
        if (
          uri &&
          !disposed &&
          target === panel &&
          current === revision &&
          remoteArtwork()
        )
          await target.webview.postMessage({ type: 'sprite', speciesId, uri });
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, species.length) }, worker),
    );
  };
  const open = (preview: boolean) => {
    demo = preview;
    page = 0;
    if (panel) {
      panel.title = demo ? 'Demo: Pokédex' : 'PR Pokémon — Pokédex';
      render();
      panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    panel = vscode.window.createWebviewPanel(
      'prPokemonFinder.pokedex',
      demo ? 'Demo: Pokédex' : 'PR Pokémon — Pokédex',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        enableCommandUris: false,
        localResourceRoots: [media],
        retainContextWhenHidden: true,
      },
    );
    const target = panel;
    const messages = target.webview.onDidReceiveMessage((message: unknown) => {
      if (
        disposed ||
        panel !== target ||
        !message ||
        typeof message !== 'object'
      )
        return;
      const data = message as {
        type?: unknown;
        key?: unknown;
        direction?: unknown;
      };
      if (data.type === 'ready') void loadArtwork().catch(() => undefined);
      if (data.type === 'refresh') {
        if (demo) render();
        else
          void vscode.commands.executeCommand(
            'prPokemonFinder.refreshCollection',
          );
      }
      if (
        data.type === 'page' &&
        (data.direction === -1 || data.direction === 1)
      ) {
        page += data.direction;
        render();
      }
      if (data.type === 'open-pr' && !demo && typeof data.key === 'string') {
        const item = state().entries.find(
          (item) => item.capture.key === data.key,
        );
        // Never accept a URL supplied by the webview.
        if (item)
          void vscode.env.openExternal(
            vscode.Uri.parse(item.capture.source.url),
          );
      }
    });
    const closed = target.onDidDispose(() => {
      messages.dispose();
      closed.dispose();
      if (panel === target) {
        panel = undefined;
        revision++;
      }
    });
    render();
  };
  const bar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    8,
  );
  bar.name = 'PR Pokémon Finder Pokédex';
  bar.text = '$(book) Pokédex';
  bar.command = 'prPokemonFinder.showPokedex';
  bar.tooltip = 'Open the account-global local Pokémon collection';
  bar.accessibilityInformation = { label: bar.tooltip };
  bar.show();
  context.subscriptions.push(
    bar,
    {
      dispose: () => {
        disposed = true;
        revision++;
        panel?.dispose();
      },
    },
    collection.onDidChange(() => {
      if (!demo) render();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('prPokemonFinder.presentation.remoteArtwork')
      )
        render();
    }),
    vscode.commands.registerCommand('prPokemonFinder.showPokedex', () =>
      open(false),
    ),
    vscode.commands.registerCommand('prPokemonFinder.previewPokedex', () =>
      open(true),
    ),
  );
}
