import type { CollectionState } from './controller';
import { pullRequestKey } from '../github/identity';

/** Sanitized preview only. Never written to account storage or used as a reward. */
export function demoCollection(): CollectionState {
  return {
    phase: 'ready',
    entries: [25, 1, 4, 7, 133, 143].map((speciesId, index) => {
      const repository = index % 2 ? 'pokedex-ui' : 'example';
      const source = {
        host: 'github.com' as const,
        owner: 'demo',
        repository,
        number: index + 1,
      };
      const key = pullRequestKey(source);
      return {
        capture: {
          key,
          pokemon: { algorithm: 'sha256-kanto-v1', speciesId },
          capturedAt: '2026-11-08T12:00:00Z',
          source: {
            ...source,
            key,
            id: index + 1,
            url: `https://github.com/demo/${repository}/pull/${index + 1}`,
            accessMode: 'public',
            observedState: index % 2 ? 'closed' : 'open',
            detectedAt: '2026-11-08T12:00:00Z',
          },
        },
        presentation: index === 0 ? 'pending' : 'shown',
      };
    }),
  };
}
