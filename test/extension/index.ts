import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilePollingStore } from '../../src/polling/file-store';
import {
  capturePending,
  decodeIndex,
  markPresentationShown,
  type PendingEncounter,
} from '../../src/polling/index';
import type { ExtensionApi } from '../../src/extension';
import { SIGN_IN_COMMAND, STATUS_COMMAND } from '../../src/auth/status';
import {
  CHECK_CONNECTION_COMMAND,
  INSPECT_PR_COMMAND,
} from '../../src/github/commands';

/** A real, isolated Extension Host smoke test; never launches interactive OAuth. */
async function verifyAuthentication(): Promise<void> {
  const extension = vscode.extensions.getExtension<ExtensionApi>(
    'john-tavares.pr-pokemon-finder',
  );
  assert.ok(extension, 'Development extension must be discoverable.');
  const api = await extension.activate();
  assert.ok(extension.isActive);
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes(SIGN_IN_COMMAND));
  assert.ok(commands.includes(STATUS_COMMAND));
  assert.ok(commands.includes(CHECK_CONNECTION_COMMAND));
  assert.ok(commands.includes(INSPECT_PR_COMMAND));
  assert.ok(commands.includes('prPokemonFinder.discoverPullRequests'));
  assert.ok(commands.includes('prPokemonFinder.enablePrivateRepositories'));
  assert.ok(commands.includes('prPokemonFinder.showMonitoringStatus'));
  assert.ok(commands.includes('prPokemonFinder.pollNow'));
  assert.ok(commands.includes('prPokemonFinder.showPendingEncounters'));
  assert.ok(commands.includes('prPokemonFinder.previewCaptureAnimation'));
  assert.ok(commands.includes('prPokemonFinder.showCaptureAnimations'));
  assert.equal(api.getMonitoringStatus().phase, 'paused');
  assert.equal(api.getMonitoringStatus().captureCount, 0);
  assert.equal(api.getMonitoringStatus().pendingCount, 0);
  assert.equal(
    vscode.workspace
      .getConfiguration('prPokemonFinder')
      .get('includePrivateRepositories'),
    false,
  );
  assert.equal(
    extension.packageJSON.contributes.configuration.properties[
      'prPokemonFinder.includePrivateRepositories'
    ].scope,
    'application',
  );
  assert.deepEqual(api.getAuthenticationState(), { status: 'disconnected' });
  await verifyCapturePersistence();
  const config = vscode.workspace.getConfiguration('prPokemonFinder');
  await config.update(
    'presentation.remoteArtwork',
    false,
    vscode.ConfigurationTarget.Global,
  );
  const preview = vscode.commands.executeCommand(
    'prPokemonFinder.previewCaptureAnimation',
  );
  let previewTab: vscode.Tab | undefined;
  for (let attempt = 0; attempt < 120 && !previewTab; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    previewTab = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .find((tab) => tab.label === 'Demo: Pikachu — Encounter');
  }
  assert.ok(
    previewTab,
    'Preview must open an actual webview tab, without OAuth or live artwork requests.',
  );
  await vscode.window.tabGroups.close(previewTab);
  await preview;
  assert.equal(
    api.getMonitoringStatus().captureCount,
    0,
    'Preview must not create a capture.',
  );
  console.log(
    'Extension Host smoke test passed: commands registered, signed out, no OAuth prompt.',
  );
  console.log('PR_POKEMON_AUTH_SMOKE_PASSED');
}

/** Exercise crypto/file APIs in the actual minimum-version Electron Node runtime. */
async function verifyCapturePersistence(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'pr-pokemon-host-test-'));
  try {
    const source: PendingEncounter = {
      key: 'pr:v1:github.com/trainer/repo/1',
      host: 'github.com',
      id: 1,
      owner: 'trainer',
      repository: 'repo',
      number: 1,
      url: 'https://github.com/trainer/repo/pull/1',
      detectedAt: '2026-11-07T12:00:00Z',
      accessMode: 'public',
      observedState: 'open',
    };
    const store = new FilePollingStore(directory, () => undefined);
    const captured = await store.update(123, (value) =>
      capturePending(
        { ...decodeIndex(value), known: [source.key], pending: [source] },
        source.detectedAt,
      ),
    );
    assert.equal(captured?.captures[0]?.pokemon.speciesId, 121);
    const restored = new FilePollingStore(directory, () => {
      throw new Error('Must not reread legacy');
    });
    await restored.update(123, (value) =>
      markPresentationShown(decodeIndex(value), source.key, source.detectedAt),
    );
    const result = await restored.update(123, (value) =>
      capturePending(decodeIndex(value), source.detectedAt),
    );
    assert.equal(result?.captures.length, 1);
    assert.equal(result?.presentations[0]?.status, 'shown');
    console.log(
      'Capture persistence smoke test passed: committed once, restored, acknowledged.',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function run(): Promise<void> {
  console.log('Starting authentication Extension Host smoke test.');
  try {
    await verifyAuthentication();
  } catch (error) {
    console.error('Authentication smoke test assertion failed:', error);
    throw error;
  }
}
