import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyVsix } from './verify-vsix.mjs';

test('VSIX verifier rejects empty, truncated and invalid packages', () => {
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from('not a VSIX'),
    Buffer.alloc(100),
  ])
    assert.throws(() => verifyVsix(bytes), /ZIP/);
});
