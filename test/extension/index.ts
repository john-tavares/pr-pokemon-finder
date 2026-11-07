import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';
import { SIGN_IN_COMMAND, STATUS_COMMAND } from '../../src/auth/status';

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
  assert.deepEqual(api.getAuthenticationState(), { status: 'disconnected' });
  console.log(
    'Extension Host smoke test passed: commands registered, signed out, no OAuth prompt.',
  );
  console.log('PR_POKEMON_AUTH_SMOKE_PASSED');
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
