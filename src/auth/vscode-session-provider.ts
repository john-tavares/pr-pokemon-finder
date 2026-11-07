import * as vscode from 'vscode';
import type {
  AccountSession,
  SessionProvider,
  SessionRequest,
} from './authentication';

export const GITHUB_PROVIDER = 'github';
export const GITHUB_SCOPES: readonly string[] = ['read:user'];

export class VSCodeSessionProvider implements SessionProvider {
  /** Request-scoped access only; the client must never persist this value. */
  async getAccessToken(): Promise<string | undefined> {
    const session = await vscode.authentication.getSession(
      GITHUB_PROVIDER,
      GITHUB_SCOPES,
      { silent: true },
    );
    return session?.accessToken;
  }

  async getSession(
    options: SessionRequest,
  ): Promise<AccountSession | undefined> {
    const session = await vscode.authentication.getSession(
      GITHUB_PROVIDER,
      GITHUB_SCOPES,
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
