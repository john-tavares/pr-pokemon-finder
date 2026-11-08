import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  assignPokemon,
  isPokemonAssignment,
} from '../../src/captures/assignment';

test('versioned deterministic assignment has stable canonical-key golden vectors', () => {
  const key = 'pr:v1:github.com/trainer/repo/1';
  assert.deepEqual(assignPokemon(key), {
    algorithm: 'sha256-kanto-v1',
    speciesId: 121,
  });
  for (let number = 1; number <= 300; number++) {
    const identity = `pr:v1:github.com/trainer/repo/${number}`;
    assert.deepEqual(assignPokemon(identity), assignPokemon(identity));
    assert.ok(isPokemonAssignment(assignPokemon(identity)));
  }
  // A 151-species pool intentionally allows collisions across different PRs.
  const species = new Set(
    Array.from(
      { length: 300 },
      (_, i) =>
        assignPokemon(`pr:v1:github.com/trainer/repo/${i + 1}`).speciesId,
    ),
  );
  assert.ok(species.size < 300);
});

test('saved versioned assignments remain readable without rerolling old rewards', () => {
  assert.ok(
    isPokemonAssignment({ algorithm: 'retired-kanto-v2', speciesId: 25 }),
  );
  for (const algorithm of ['future', '', 'unsafe\n-v1', 'sha256-v0']) {
    assert.equal(isPokemonAssignment({ algorithm, speciesId: 25 }), false);
  }
  assert.equal(
    isPokemonAssignment({ algorithm: 'sha256-kanto-v1', speciesId: 152 }),
    false,
  );
  assert.throws(() => assignPokemon('not-a-pr'));
});
