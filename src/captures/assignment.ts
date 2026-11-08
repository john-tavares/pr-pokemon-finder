import { createHash } from 'node:crypto';
import { isPullRequestKey } from '../github/identity';

export interface PokemonAssignment {
  readonly algorithm: 'sha256-kanto-v1';
  readonly speciesId: number;
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
