import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { PollingController } from '../polling/controller';
import type { Capture } from '../polling/index';
import { FilePresentationGate } from './gate';
import { SpriteLoader } from './sprites';
import { pokemonName } from './catalog';
import { renderSceneHtml } from './webview';
import { PresentationQueue } from './queue';

export function registerCapturePresentation(
  context: vscode.ExtensionContext,
  polling: PollingController,
): void {
  const gate = new FilePresentationGate(
    join(context.globalStorageUri.fsPath, 'sync'),
  );
  const sprites = new SpriteLoader();
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  let disposed = false;
  let generation = 0;
  let running = false;
  let active:
    { panel: vscode.WebviewPanel; key: string; demo: boolean } | undefined;
  let lastError = '';
  const deferred = new Set<string>();
  const config = () => vscode.workspace.getConfiguration('prPokemonFinder');
  const cancel = () => {
    generation++;
    active?.panel.dispose();
  };

  const show = async (
    capture: Capture,
    sourceCurrent: () => boolean,
    demo = false,
  ): Promise<boolean> => {
    const currentGeneration = generation;
    const current = () =>
      !disposed && currentGeneration === generation && sourceCurrent();
    const remoteArtwork =
      config().get<boolean>('presentation.remoteArtwork', true) === true;
    const [sprite, companionSprite] = remoteArtwork
      ? await Promise.all([
          sprites.load(capture.pokemon.speciesId),
          sprites.load(1, 'back'),
        ])
      : [undefined, undefined];
    if (!current()) return false;
    const panel = vscode.window.createWebviewPanel(
      'prPokemonFinder.capture',
      `${demo ? 'Demo: ' : ''}${pokemonName(capture.pokemon.speciesId)} — Encounter`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        enableCommandUris: false,
        retainContextWhenHidden: true,
        localResourceRoots: [media],
      },
    );
    active = { panel, key: capture.key, demo };
    let ready = false;
    let captureStarted = false;
    let completed = false;
    let retrying = false;
    return new Promise<boolean>((resolve) => {
      const subscriptions: vscode.Disposable[] = [];
      subscriptions.push(
        panel.onDidDispose(() => {
          if (active?.panel === panel) active = undefined;
          for (const subscription of subscriptions) subscription.dispose();
          if (!demo && ready && current() && !completed)
            deferred.add(capture.key);
          resolve(ready && completed && current());
        }),
      );
      subscriptions.push(
        panel.webview.onDidReceiveMessage((message: unknown) => {
          if (!current() || !message || typeof message !== 'object') return;
          const type = (message as { type?: unknown }).type;
          if (type === 'ready' && panel.visible) ready = true;
          if (type === 'catch' && ready && panel.visible) captureStarted = true;
          if (type === 'captured' && captureStarted) completed = true;
          if (type === 'dismiss') panel.dispose();
          if (type === 'open-pr' && !demo)
            void vscode.env.openExternal(vscode.Uri.parse(capture.source.url));
          if (type === 'retry-artwork' && remoteArtwork && !retrying) {
            retrying = true;
            void sprites
              .load(capture.pokemon.speciesId)
              .then((uri) => {
                if (uri && current() && active?.panel === panel)
                  return panel.webview.postMessage({ type: 'sprite', uri });
                return undefined;
              })
              .catch(() => undefined)
              .finally(() => {
                retrying = false;
              });
          }
        }),
      );
      panel.webview.html = renderSceneHtml({
        capture,
        sprite,
        companionSprite,
        demo,
        remoteArtwork,
        reducedMotion:
          config().get<boolean>('presentation.reducedMotion', false) === true ||
          vscode.workspace
            .getConfiguration('workbench')
            .get<string>('reduceMotion') === 'on',
        nonce: randomBytes(24).toString('hex'),
        cspSource: panel.webview.cspSource,
        scriptUri: panel.webview
          .asWebviewUri(vscode.Uri.joinPath(media, 'capture.js'))
          .toString(),
        styleUri: panel.webview
          .asWebviewUri(vscode.Uri.joinPath(media, 'capture.css'))
          .toString(),
      });
    });
  };

  const queue = new PresentationQueue(async (manual) => {
    if (
      disposed ||
      running ||
      active ||
      (!manual && config().get<boolean>('presentation.enabled', true) !== true)
    )
      return;
    running = true;
    if (manual) deferred.clear();
    try {
      while (
        !disposed &&
        polling.pendingCaptures.some((item) => !deferred.has(item.key)) &&
        (manual || config().get<boolean>('presentation.enabled', true) === true)
      ) {
        const deferredCount = deferred.size;
        const progressed = await polling.presentNext(
          gate,
          (capture, isCurrent) => show(capture, isCurrent),
          deferred,
        );
        if (!progressed && deferred.size === deferredCount) break;
        lastError = '';
      }
    } catch {
      const key = polling.pendingCaptures[0]?.key ?? 'storage';
      if (!disposed && key !== lastError) {
        lastError = key;
        void vscode.window.showWarningMessage(
          'Capture presentation could not be confirmed. Your Pokémon is safe; retry with Show Pending Capture Animations.',
        );
      }
    } finally {
      running = false;
    }
  });
  const pump = (manual = false) => queue.request(manual);

  context.subscriptions.push(
    queue,
    {
      dispose: () => {
        disposed = true;
        cancel();
      },
    },
    polling.onDidChangeStatus(() => {
      if (
        active &&
        !active.demo &&
        !polling.pendingCaptures.some((item) => item.key === active!.key)
      )
        cancel();
      if (
        polling.status.phase !== 'polling' &&
        polling.status.phase !== 'paused'
      )
        void pump();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('prPokemonFinder.presentation') ||
        event.affectsConfiguration('workbench.reduceMotion')
      ) {
        cancel();
        void pump();
      }
    }),
    vscode.commands.registerCommand(
      'prPokemonFinder.showCaptureAnimations',
      async () => {
        if (!polling.pendingCaptures.length) {
          await vscode.window.showInformationMessage(
            'No loaded capture animations pending. Sign in and check for new PRs, or run Preview Capture Animation.',
          );
          return;
        }
        await pump(true);
      },
    ),
    vscode.commands.registerCommand(
      'prPokemonFinder.previewCaptureAnimation',
      async () => {
        if (running || active) {
          active?.panel.reveal(undefined, true);
          return;
        }
        running = true;
        try {
          const detectedAt = new Date().toISOString();
          await show(
            {
              key: 'pr:v1:github.com/demo/example/25',
              capturedAt: detectedAt,
              pokemon: { speciesId: 25, algorithm: 'sha256-kanto-v1' },
              source: {
                key: 'pr:v1:github.com/demo/example/25',
                host: 'github.com',
                id: 25,
                owner: 'demo',
                repository: 'example',
                number: 25,
                url: 'https://github.com/demo/example/pull/25',
                detectedAt,
                accessMode: 'public',
                observedState: 'open',
              },
            },
            () => true,
            true,
          );
        } catch {
          void vscode.window.showWarningMessage(
            'The capture preview could not be opened. No collection data was changed.',
          );
        } finally {
          running = false;
          void pump();
        }
      },
    ),
  );
  void pump();
}
