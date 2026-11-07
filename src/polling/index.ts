import type { DiscoveryResult } from '../github/discovery';
import { parsePullRequestUrl } from '../github/client';

export interface PendingEncounter {
  readonly id: number;
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
  readonly url: string;
  readonly detectedAt: string;
  readonly accessMode: 'public' | 'private';
  readonly observedState: 'open' | 'closed';
}

export interface PollingIndex {
  readonly version: 1;
  readonly known: readonly number[];
  readonly pending: readonly PendingEncounter[];
  readonly baselines: Partial<Record<'public' | 'private', string>>;
}

export function decodeIndex(value: unknown): PollingIndex {
  if (value === undefined)
    return { version: 1, known: [], pending: [], baselines: {} };
  if (!value || typeof value !== 'object')
    throw new Error('Invalid polling index.');
  const data = value as PollingIndex;
  const date = (input: unknown) =>
    typeof input === 'string' && Number.isFinite(Date.parse(input));
  const id = (input: unknown) =>
    typeof input === 'number' && Number.isSafeInteger(input) && input > 0;
  if (
    data.version !== 1 ||
    !Array.isArray(data.known) ||
    !data.known.every(id) ||
    !Array.isArray(data.pending) ||
    !data.baselines ||
    typeof data.baselines !== 'object' ||
    Array.isArray(data.baselines) ||
    Object.entries(data.baselines).some(
      ([key, value]) => !['public', 'private'].includes(key) || !date(value),
    ) ||
    data.pending.some(
      (item) =>
        !item ||
        !id(item.id) ||
        !id(item.number) ||
        typeof item.owner !== 'string' ||
        typeof item.repository !== 'string' ||
        typeof item.url !== 'string' ||
        !date(item.detectedAt) ||
        !['public', 'private'].includes(item.accessMode) ||
        !['open', 'closed'].includes(item.observedState),
    )
  ) {
    throw new Error('Unsupported or invalid polling index.');
  }
  const known = new Set(data.known);
  if (
    known.size !== data.known.length ||
    new Set(data.pending.map((item) => item.id)).size !== data.pending.length ||
    data.pending.some((item) => {
      const reference = parsePullRequestUrl(item.url);
      return (
        !known.has(item.id) ||
        !reference ||
        reference.owner !== item.owner ||
        reference.repository !== item.repository ||
        reference.number !== item.number
      );
    })
  )
    throw new Error('Inconsistent polling index.');
  return data;
}

export function reconcilePolling(
  previous: PollingIndex,
  result: DiscoveryResult,
  includePrivate: boolean,
  startedAt: string,
): { index: PollingIndex; added: readonly PendingEncounter[] } {
  const mode = includePrivate ? 'private' : 'public';
  const baseline = previous.baselines[mode] ?? startedAt;
  const known = new Set(previous.known);
  const pending = new Map(previous.pending.map((item) => [item.id, item]));
  const added: PendingEncounter[] = [];
  for (const pr of result.items) {
    if (
      !known.has(pr.id) &&
      !pending.has(pr.id) &&
      Date.parse(pr.createdAt) >= Date.parse(baseline)
    ) {
      const encounter: PendingEncounter = {
        id: pr.id,
        owner: pr.owner,
        repository: pr.repository,
        number: pr.number,
        url: pr.url,
        detectedAt: startedAt,
        accessMode: mode,
        observedState: pr.state,
      };
      pending.set(pr.id, encounter);
      added.push(encounter);
    }
    known.add(pr.id);
  }
  return {
    index: {
      version: 1,
      known: [...known],
      pending: [...pending.values()],
      baselines: { ...previous.baselines, [mode]: baseline },
    },
    added,
  };
}
