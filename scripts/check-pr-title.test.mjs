import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTitle } from './check-pr-title.mjs';

test('accepts supported types, optional scopes, and breaking changes', () => {
  for (const type of [
    'feat',
    'fix',
    'docs',
    'style',
    'refactor',
    'perf',
    'test',
    'build',
    'ci',
    'chore',
    'revert',
  ]) {
    assert.equal(validateTitle(`${type}: describe the change`), true);
  }
  assert.equal(validateTitle('feat(sync): reconcile pull requests'), true);
  assert.equal(validateTitle('feat(storage)!: change schema'), true);
  assert.equal(validateTitle('ci(github-actions): pin actions'), true);
  assert.equal(validateTitle('fix(api/github): handle errors'), true);
});

test('rejects invalid format, types, scopes, whitespace, and missing descriptions', () => {
  for (const title of [
    undefined,
    null,
    '',
    'Add feature',
    'unknown: change',
    'Feat: change',
    'feat: ',
    'feat:  ',
    'feat:  change',
    'feat(UPPER): change',
    'feat: change\nextra',
    ' docs: change',
    'docs: change ',
  ]) {
    assert.equal(validateTitle(title), false);
  }
});

test('enforces the inclusive 72-character limit', () => {
  assert.equal(validateTitle(`docs: ${'a'.repeat(66)}`), true);
  assert.equal(validateTitle(`docs: ${'a'.repeat(67)}`), false);
});

test('treats shell metacharacters as ordinary title text', () => {
  assert.equal(
    validateTitle('docs: explain $(echo example) and `commands`'),
    true,
  );
});
