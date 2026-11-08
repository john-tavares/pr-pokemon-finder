import * as vscode from 'vscode';
import { join } from 'node:path';
import type { AuthenticationController } from '../auth/authentication';
import { privateRepositoriesEnabled } from '../auth/vscode-session-provider';
import type { GitHubClient } from '../github/client';
import { discoverPullRequests } from '../github/discovery';
import { PollingController } from './controller';
import { FilePollingStore } from './file-store';

export function registerPolling(
  context: vscode.ExtensionContext,
  github: GitHubClient,
  authentication: AuthenticationController,
): PollingController {
  const polling = new PollingController(
    (options) => discoverPullRequests(github, options),
    new FilePollingStore(join(context.globalStorageUri.fsPath, 'sync'), (id) =>
      context.globalState.get(`polling.v1.account.${id}`),
    ),
    () => authentication.invalidateSession(),
  );
  const bar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    9,
  );
  bar.name = 'PR Pokémon Finder monitoring';
  bar.command = 'prPokemonFinder.showMonitoringStatus';
  let key = '';
  let picker: vscode.CancellationTokenSource | undefined;
  const refresh = () => {
    const config = vscode.workspace.getConfiguration('prPokemonFinder');
    const active =
      config.get<boolean>('polling.enabled', true) === true &&
      authentication.state.status === 'connected';
    const includePrivate = privateRepositoriesEnabled();
    const intervalSeconds = config.get<number>('polling.intervalSeconds', 60);
    const nextKey = `${authentication.accountId ?? 'paused'}:${active}:${includePrivate}:${intervalSeconds}`;
    if (nextKey === key) return;
    key = nextKey;
    picker?.cancel();
    polling.configure({ active, includePrivate, intervalSeconds });
  };
  const render = () => {
    const status = polling.status;
    bar.text =
      status.phase === 'polling'
        ? '$(sync~spin) PR Pokémon: Checking PRs'
        : status.phase === 'error' || status.phase === 'partial'
          ? '$(warning) PR Pokémon: Monitoring'
          : status.phase === 'paused'
            ? '$(debug-pause) PR Pokémon: Paused'
            : `$(sync) PR Pokémon: ${status.pendingCount} pending`;
    bar.tooltip = `Monitoring: ${status.phase}. Known PRs: ${status.knownCount}. Captures: ${status.captureCount}. Pending presentations: ${status.pendingCount}.${status.error ? ` Error: ${status.error}.` : ''}`;
    bar.accessibilityInformation = { label: bar.tooltip };
    bar.show();
  };
  context.subscriptions.push(
    polling,
    bar,
    {
      dispose: () => {
        picker?.cancel();
        picker?.dispose();
      },
    },
    polling.onDidChangeStatus(render),
    authentication.onDidChangeState(refresh),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('prPokemonFinder')) refresh();
    }),
    vscode.commands.registerCommand(
      'prPokemonFinder.showMonitoringStatus',
      () => {
        const status = polling.status;
        return vscode.window.showInformationMessage(
          `PR monitoring: ${status.phase}. ${status.knownCount} known PRs, ${status.captureCount} captures, ${status.pendingCount} pending presentations. Last check: ${status.lastCheckedAt ?? 'none'}.${status.error ? ` Error: ${status.error}.` : ''}`,
        );
      },
    ),
    vscode.commands.registerCommand('prPokemonFinder.pollNow', () =>
      polling.status.phase === 'paused'
        ? vscode.window.showInformationMessage(
            'Monitoring is paused. Sign in and enable polling to check for new PRs.',
          )
        : polling.pollNow(),
    ),
    vscode.commands.registerCommand(
      'prPokemonFinder.showPendingEncounters',
      async () => {
        const items = polling.pendingCaptures;
        if (!items.length) {
          await vscode.window.showInformationMessage(
            polling.status.phase === 'paused'
              ? 'Monitoring is paused. Sign in and enable polling to load pending encounters.'
              : 'No loaded captures awaiting presentation.',
          );
          return;
        }
        const currentKey = key;
        picker?.cancel();
        picker?.dispose();
        const source = new vscode.CancellationTokenSource();
        picker = source;
        try {
          const choice = await vscode.window.showQuickPick(
            items.map((item) => ({
              label: `${item.source.owner}/${item.source.repository} #${item.source.number}`,
              description: `Pokémon #${item.pokemon.speciesId} captured · Retro presentation pending`,
              item,
            })),
            {
              title: 'PR Pokémon Finder: Pending Capture Presentations',
              placeHolder: 'Choose a PR to open on GitHub.',
            },
            source.token,
          );
          if (
            choice &&
            currentKey === key &&
            !source.token.isCancellationRequested
          )
            await vscode.env.openExternal(
              vscode.Uri.parse(choice.item.source.url),
            );
        } finally {
          source.dispose();
          if (picker === source) picker = undefined;
        }
      },
    ),
  );
  refresh();
  render();
  return polling;
}
