import * as vscode from 'vscode';
import type {
  AccountSession,
  SessionProvider,
  SessionRequest,
} from './authentication';
import { githubScopes, PRIVATE_GITHUB_SCOPES } from './scopes';

export const GITHUB_PROVIDER = 'github';
export function privateRepositoriesEnabled(): boolean {
  return (
    vscode.workspace
      .getConfiguration('prPokemonFinder')
      .get<boolean>('includePrivateRepositories', false) === true
  );
}

export class VSCodeSessionProvider implements SessionProvider {
  async authorizePrivateRepositories(): Promise<void> {
    await vscode.authentication.getSession(
      GITHUB_PROVIDER,
      PRIVATE_GITHUB_SCOPES,
      { createIfNone: true },
    );
  }
  /** Request-scoped access only; the client must never persist this value. */
  async getAccessToken(): Promise<string | undefined> {
    const session = await vscode.authentication.getSession(
      GITHUB_PROVIDER,
      githubScopes(privateRepositoriesEnabled()),
      { silent: true },
    );
    return session?.accessToken;
  }

  async getSession(
    options: SessionRequest,
  ): Promise<AccountSession | undefined> {
    const session = await vscode.authentication.getSession(
      GITHUB_PROVIDER,
      githubScopes(privateRepositoriesEnabled()),
      options,
    );
    // Do not retain or return the raw session/token outside the API boundary.
    return session
      ? { account: { id: session.account.id, label: session.account.label } }
      : undefined;
  }

  onDidChangeSessions(
    listener: (providerId: string) => void,
  ): vscode.Disposable {
    return vscode.authentication.onDidChangeSessions((event) =>
      listener(event.provider.id),
    );
  }
}
