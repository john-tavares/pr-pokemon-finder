import * as vscode from 'vscode';
import { join } from 'node:path';
import type { AuthenticationController } from '../auth/authentication';
import { privateRepositoriesEnabled } from '../auth/vscode-session-provider';
import type { PollingController } from '../polling/controller';
import { FilePollingStore } from '../polling/file-store';
import { CollectionController } from './controller';
import { groupByRepository } from './repositories';
import { pokemonName } from '../presentation/catalog';

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
  let viewRevision = 0;
  context.subscriptions.push(
    collection.onDidChange(() => {
      viewRevision++;
    }),
  );
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
    vscode.commands.registerCommand(
      'prPokemonFinder.refreshCollection',
      refresh,
    ),
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
      'prPokemonFinder.browseRepositoryCaptures',
      async () => {
        await refresh();
        const revision = viewRevision;
        const groups = groupByRepository(collection.state.entries);
        if (!groups.length) {
          await vscode.window.showInformationMessage(
            'No loaded repository captures. Sign in and complete an initial synchronization; new PRs then grant rewards across all repositories.',
          );
          return;
        }
        const repository = await vscode.window.showQuickPick(
          groups.map((group) => ({
            label: group.label,
            description: `${group.entries.length} local rewards`,
            group,
          })),
          { title: 'PR Pokémon Finder: Repository Captures' },
        );
        if (!repository || revision !== viewRevision) return;
        const reward = await vscode.window.showQuickPick(
          repository.group.entries.map((item) => ({
            label: pokemonName(item.capture.pokemon.speciesId),
            description: `#${item.capture.source.number} · ${item.presentation === 'pending' ? 'Animation pending' : 'Animation shown'}`,
            detail: item.capture.source.url,
            item,
          })),
          {
            title: repository.group.label,
            placeHolder: 'Choose a reward to open its source PR.',
          },
        );
        if (reward && revision === viewRevision)
          await vscode.env.openExternal(
            vscode.Uri.parse(reward.item.capture.source.url),
          );
      },
    ),
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
