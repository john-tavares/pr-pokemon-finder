import * as vscode from 'vscode';
import type { AuthenticationController } from '../auth/authentication';
import { SIGN_IN_COMMAND } from '../auth/status';
import { GitHubApiError, GitHubClient, parsePullRequestUrl } from './client';

export const CHECK_CONNECTION_COMMAND = 'prPokemonFinder.checkGitHubConnection';
export const INSPECT_PR_COMMAND = 'prPokemonFinder.inspectPullRequest';

export function registerGitHubCommands(
  context: vscode.ExtensionContext,
  client: GitHubClient,
  authentication: AuthenticationController,
): void {
  const handleError = async (error: unknown) => {
    const code =
      error instanceof GitHubApiError ? error.code : 'service-unavailable';
    if (
      code === 'authentication-expired' ||
      code === 'authentication-required'
    ) {
      authentication.invalidateSession();
      const message =
        code === 'authentication-expired'
          ? 'GitHub rejected the session. Sign in again to reconnect.'
          : 'Sign in to GitHub before using the API.';
      if (
        (await vscode.window.showWarningMessage(message, 'Sign in')) ===
        'Sign in'
      ) {
        await vscode.commands.executeCommand(SIGN_IN_COMMAND);
      }
      return;
    }
    const messages = {
      'authentication-unavailable':
        'GitHub authentication is unavailable. Enable the built-in GitHub Authentication extension and retry.',
      forbidden:
        'GitHub denied access. Check your account permissions and organization policies.',
      'not-found':
        'The pull request was not found or is not accessible to this session. Private repository access is not enabled in this version.',
      'rate-limited': `GitHub API limit reached. Try again in ${error instanceof GitHubApiError ? (error.retryAfterSeconds ?? 60) : 60} seconds.`,
      network:
        'Could not reach GitHub within the request timeout. Check your connection and retry. For a moved repository, use its current URL.',
      'invalid-response':
        'GitHub returned an unexpected response. Try again later.',
      'invalid-pull-request': 'Enter a valid GitHub.com pull request URL.',
      'service-unavailable':
        'GitHub could not complete the request. Try again later.',
    };
    await vscode.window.showWarningMessage(messages[code]);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(CHECK_CONNECTION_COMMAND, async () => {
      try {
        const user = await client.getAuthenticatedUser();
        await vscode.window.showInformationMessage(
          `GitHub API connection verified as ${user.login}.`,
        );
      } catch (error) {
        await handleError(error);
      }
    }),
    vscode.commands.registerCommand(INSPECT_PR_COMMAND, async () => {
      const input = await vscode.window.showInputBox({
        title: 'PR Pokémon Finder: Inspect Pull Request',
        prompt: 'Enter the URL of a public GitHub.com pull request.',
        placeHolder: 'https://github.com/owner/repository/pull/123',
        ignoreFocusOut: true,
        validateInput: (value) =>
          parsePullRequestUrl(value)
            ? undefined
            : 'Enter a valid GitHub.com pull request URL.',
      });
      if (!input) return;
      const reference = parsePullRequestUrl(input);
      if (!reference) return;
      try {
        const pr = await client.getPullRequest(reference);
        await vscode.window.showInformationMessage(
          `${pr.owner}/${pr.repository} #${pr.number}: ${pr.merged ? 'merged' : pr.state} — ${pr.title}`,
        );
      } catch (error) {
        await handleError(error);
      }
    }),
  );
}
