import * as vscode from 'vscode';
import { join } from 'node:path';
import type { AuthenticationController } from '../auth/authentication';
import { privateRepositoriesEnabled } from '../auth/vscode-session-provider';
import type { PollingController } from '../polling/controller';
import { FilePollingStore } from '../polling/file-store';
import { CollectionController } from './controller';

export function registerCollection(
  context: vscode.ExtensionContext,
  authentication: AuthenticationController,
  polling: PollingController,
): CollectionController {
  const store = new FilePollingStore(
    join(context.globalStorageUri.fsPath, 'sync'),
    (id) => context.globalState.get(`polling.v1.account.${id}`),
  );
  const collection = new CollectionController((id) => store.readSnapshot(id));
  const refresh = async () => {
    const nativeId = authentication.accountId;
    const signedIn =
      authentication.state.status === 'connected' && nativeId !== undefined;
    const mappingKey =
      nativeId === undefined
        ? undefined
        : `collection.account.v1.${encodeURIComponent(nativeId)}`;
    // Only a completed identity-validated poll may establish the mapping.
    const verified = signedIn ? polling.activeAccountId : undefined;
    const saved = mappingKey
      ? context.globalState.get<number>(mappingKey)
      : undefined;
    const accountId =
      verified ??
      (Number.isSafeInteger(saved) && saved! > 0 ? saved : undefined);
    const read = collection.refresh(
      signedIn,
      accountId,
      privateRepositoriesEnabled(),
    );
    if (mappingKey && verified !== undefined && verified !== saved) {
      try {
        await context.globalState.update(mappingKey, verified);
      } catch {
        // Current session remains usable; next launch will verify again.
      }
    }
    await read;
  };
  context.subscriptions.push(
    collection,
    authentication.onDidChangeState(() => {
      void refresh();
    }),
    polling.onDidChangeStatus(() => {
      void refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('prPokemonFinder.includePrivateRepositories')
      )
        void refresh();
    }),
    vscode.commands.registerCommand(
      'prPokemonFinder.showCollectionStatus',
      async () => {
        await refresh();
        const state = collection.state;
        await vscode.window.showInformationMessage(
          `Local Pokédex: ${state.phase}. ${state.entries.length} rewards, including ${state.entries.filter((item) => item.presentation === 'pending').length} awaiting animation. Stored globally for this GitHub account.`,
        );
      },
    ),
  );
  void refresh();
  return collection;
}
