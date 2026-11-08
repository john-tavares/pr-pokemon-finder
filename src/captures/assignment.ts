import { createHash } from 'node:crypto';
import { isPullRequestKey } from '../github/identity';

export interface PokemonAssignment {
  readonly algorithm: string;
  readonly speciesId: number;
}

/** Stored assignments are authoritative, including versions no longer generated. */
export function isPokemonAssignment(
  value: unknown,
): value is PokemonAssignment {
  if (!value || typeof value !== 'object') return false;
  const item = value as PokemonAssignment;
  return (
    typeof item.algorithm === 'string' &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*-v[1-9][0-9]*$/.test(item.algorithm) &&
    item.algorithm.length <= 80 &&
    Number.isSafeInteger(item.speciesId) &&
    item.speciesId >= 1 &&
    item.speciesId <= 151
  );
}

/** Initial pool: National Pokédex numbers 1–151, without Shiny/rarity tiers. */
export function assignPokemon(key: string): PokemonAssignment {
  if (!isPullRequestKey(key)) throw new Error('Invalid capture identity.');
  const digest = createHash('sha256')
    .update(`sha256-kanto-v1\n${key}`)
    .digest('hex');
  return {
    algorithm: 'sha256-kanto-v1',
    speciesId: Number(BigInt(`0x${digest}`) % 151n) + 1,
  };
}
