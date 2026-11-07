import assert from 'node:assert/strict';
import test from 'node:test';
import { assignPokemon } from '../../src/captures/assignment';

test('assignment uses a stable versioned seed and preserves the initial species pool', () => {
  const key = 'pr:v1:github.com/trainer/repo/1';
  const expected = assignPokemon(key);
  assert.equal(expected.algorithm, 'sha256-kanto-v1');
  assert.equal(expected.speciesId, 121);
  assert.deepEqual(assignPokemon(key), expected);
  for (let number = 1; number <= 1000; number++) {
    const pokemon = assignPokemon(`pr:v1:github.com/trainer/repo/${number}`);
    assert.ok(pokemon.speciesId >= 1 && pokemon.speciesId <= 151);
    assert.ok(Number.isInteger(pokemon.speciesId));
  }
  assert.throws(() => assignPokemon('invalid'));
});
