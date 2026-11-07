import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { runTests } from '@vscode/test-electron';

try {
  const cache = fileURLToPath(new URL('../.vscode-test/', import.meta.url));
  mkdirSync(cache, { recursive: true });
  const profile = mkdtempSync(join(cache, 'profile-'));
  let output = '';
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      output = (output + chunk.toString()).slice(-16384);
      process.stdout.write(chunk);
      callback();
    },
  });
  await runTests({
    stdout,
    vscodeExecutablePath: process.env.VSCODE_TEST_EXECUTABLE,
    version: process.env.VSCODE_TEST_VERSION ?? '1.95.3',
    extensionDevelopmentPath: fileURLToPath(new URL('..', import.meta.url)),
    extensionTestsPath: fileURLToPath(
      new URL('../out/test/extension/index.js', import.meta.url),
    ),
    launchArgs: [
      `--user-data-dir=${profile}`,
      '--disable-gpu',
      '--disable-extensions',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
    ],
  });
  if (!output.includes('PR_POKEMON_AUTH_SMOKE_PASSED')) {
    throw new Error('VS Code exited before the smoke test completed.');
  }
} catch (error) {
  console.error(
    'Extension Host test failed:',
    error instanceof Error ? error.message : 'Unknown test runner failure.',
  );
  process.exitCode = 1;
}
