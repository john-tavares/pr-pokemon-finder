import * as vscode from 'vscode';
import type { AuthenticationController } from '../auth/authentication';
import { privateRepositoriesEnabled } from '../auth/vscode-session-provider';
import type { GitHubClient } from '../github/client';
import { discoverPullRequests } from '../github/discovery';
import { PollingController } from './controller';

export function registerPolling(
  context: vscode.ExtensionContext,
  github: GitHubClient,
  authentication: AuthenticationController,
): PollingController {
  const polling = new PollingController(
    (options) => discoverPullRequests(github, options),
    {
      read: (id) => context.globalState.get(`polling.v1.account.${id}`),
      write: async (id, index) => {
        await context.globalState.update(`polling.v1.account.${id}`, index);
      },
    },
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
    const nextKey = `${authentication.state.status === 'connected' ? authentication.state.accountLabel : 'paused'}:${active}:${includePrivate}:${intervalSeconds}`;
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
    bar.tooltip = `Monitoring: ${status.phase}. Known PRs: ${status.knownCount}. Pending encounters: ${status.pendingCount}.${status.error ? ` Error: ${status.error}.` : ''}`;
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
          `PR monitoring: ${status.phase}. ${status.knownCount} known PRs, ${status.pendingCount} pending encounters. Last check: ${status.lastCheckedAt ?? 'none'}.${status.error ? ` Error: ${status.error}.` : ''}`,
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
        const items = polling.pendingEncounters;
        if (!items.length) {
          await vscode.window.showInformationMessage(
            polling.status.phase === 'paused'
              ? 'Monitoring is paused. Sign in and enable polling to load pending encounters.'
              : 'No loaded PRs awaiting encounter generation.',
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
              label: `${item.owner}/${item.repository} #${item.number}`,
              description: `${item.observedState} when detected ${item.detectedAt} · Pokémon generation pending`,
              item,
            })),
            {
              title: 'PR Pokémon Finder: Pending Encounters',
              placeHolder: 'Choose a PR to open on GitHub.',
            },
            source.token,
          );
          if (
            choice &&
            currentKey === key &&
            !source.token.isCancellationRequested
          )
            await vscode.env.openExternal(vscode.Uri.parse(choice.item.url));
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
