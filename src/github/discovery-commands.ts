import * as vscode from 'vscode';
import type { AuthenticationController } from '../auth/authentication';
import {
  privateRepositoriesEnabled,
  type VSCodeSessionProvider,
} from '../auth/vscode-session-provider';
import { GitHubApiError, type GitHubClient } from './client';
import { createGitHubErrorHandler } from './commands';
import { discoverPullRequests } from './discovery';

export const DISCOVER_PRS_COMMAND = 'prPokemonFinder.discoverPullRequests';
export const ENABLE_PRIVATE_COMMAND =
  'prPokemonFinder.enablePrivateRepositories';

export function registerDiscoveryCommands(
  context: vscode.ExtensionContext,
  client: GitHubClient,
  authentication: AuthenticationController,
  provider: VSCodeSessionProvider,
): void {
  const handleError = createGitHubErrorHandler(authentication);
  let busy = false;
  let disposed = false;
  let accessRevision = 0;
  let activePicker: vscode.CancellationTokenSource | undefined;
  context.subscriptions.push(
    {
      dispose: () => {
        disposed = true;
        activePicker?.cancel();
        activePicker?.dispose();
      },
    },
    authentication.onDidChangeState(() => {
      accessRevision++;
      activePicker?.cancel();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        !event.affectsConfiguration(
          'prPokemonFinder.includePrivateRepositories',
        )
      )
        return;
      accessRevision++;
      authentication.resetSession();
      void authentication.restore();
    }),
    vscode.commands.registerCommand(ENABLE_PRIVATE_COMMAND, async () => {
      if (privateRepositoriesEnabled()) {
        await authentication.signIn();
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        'GitHub requires the broad repo OAuth scope for private repository access. This scope permits read and write access, although PR Pokémon Finder only reads data. Continue to native GitHub consent?',
        { modal: true },
        'Enable and sign in',
      );
      if (choice !== 'Enable and sign in') return;
      try {
        await provider.authorizePrivateRepositories();
        if (disposed) return;
        await vscode.workspace
          .getConfiguration('prPokemonFinder')
          .update(
            'includePrivateRepositories',
            true,
            vscode.ConfigurationTarget.Global,
          );
        authentication.resetSession();
        await authentication.restore();
        await vscode.window.showInformationMessage(
          'Private repository discovery enabled for the authorized GitHub session. Organization restrictions still apply.',
        );
      } catch {
        await vscode.window.showInformationMessage(
          'Private repository authorization was not completed. Public-only access remains selected. You can retry.',
        );
      }
    }),
    vscode.commands.registerCommand(DISCOVER_PRS_COMMAND, async () => {
      if (busy) {
        await vscode.window.showInformationMessage(
          'Pull request discovery is already running.',
        );
        return;
      }
      busy = true;
      const revision = accessRevision;
      const includePrivate = privateRepositoriesEnabled();
      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'PR Pokémon Finder: Discovering your pull requests',
            cancellable: true,
          },
          (_progress, cancellation) =>
            discoverPullRequests(client, {
              includePrivate,
              isCanceled: () =>
                disposed ||
                cancellation.isCancellationRequested ||
                revision !== accessRevision,
            }),
        );
        if (disposed) return;
        if (revision !== accessRevision)
          throw new GitHubApiError('account-changed');
        if (!result.complete) {
          void vscode.window.showWarningMessage(
            `Showing ${result.items.length} of ${result.totalCount} reported pull requests. GitHub search limits, incomplete results, or concurrent changes prevented a complete result. Retry later; missing entries do not mean deletion.`,
          );
        }
        if (result.items.length === 0) {
          await vscode.window.showInformationMessage(
            result.complete
              ? `No authored pull requests found for ${result.account.login}${includePrivate ? ' in accessible repositories' : ' in public repositories'}.`
              : 'No records were returned by this incomplete search. Retry later.',
          );
          return;
        }
        if (disposed || revision !== accessRevision) return;
        activePicker = new vscode.CancellationTokenSource();
        const selection = await vscode.window.showQuickPick(
          result.items.map((pr) => ({
            label: pr.title,
            description: `${pr.owner}/${pr.repository} #${pr.number} · ${pr.state}`,
            detail: `Updated ${pr.updatedAt} · Created ${pr.createdAt}`,
            pr,
          })),
          {
            title: `Pull requests by ${result.account.login}`,
            matchOnDescription: true,
            placeHolder: 'Choose a pull request to view its metadata.',
          },
          activePicker.token,
        );
        if (!selection || disposed || revision !== accessRevision) return;
        const pr = selection.pr;
        const action = await vscode.window.showInformationMessage(
          `${pr.owner}/${pr.repository} #${pr.number} · ${pr.state} · Created ${pr.createdAt} · Updated ${pr.updatedAt} · Closed ${pr.closedAt ?? 'not closed'}`,
          'Open on GitHub',
        );
        if (
          action === 'Open on GitHub' &&
          !disposed &&
          revision === accessRevision
        )
          await vscode.env.openExternal(vscode.Uri.parse(pr.url));
      } catch (error) {
        if (
          !disposed &&
          !(
            error instanceof GitHubApiError &&
            error.code === 'discovery-canceled'
          )
        )
          await handleError(error);
      } finally {
        activePicker?.dispose();
        activePicker = undefined;
        busy = false;
      }
    }),
  );
}
