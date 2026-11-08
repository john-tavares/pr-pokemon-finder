import type { DiscoveryResult } from '../github/discovery';
import { parsePullRequestUrl } from '../github/client';
import { isPullRequestKey, pullRequestKey } from '../github/identity';
import {
  assignPokemon,
  isPokemonAssignment,
  type PokemonAssignment,
} from '../captures/assignment';

interface LegacyPendingEncounter {
  readonly id: number;
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
  readonly url: string;
  readonly detectedAt: string;
  readonly accessMode: 'public' | 'private';
  readonly observedState: 'open' | 'closed';
}

interface LegacyPollingIndex {
  readonly version: 1;
  readonly known: readonly number[];
  readonly pending: readonly LegacyPendingEncounter[];
  readonly baselines: Partial<Record<'public' | 'private', string>>;
}

function decodeLegacyIndex(value: unknown): LegacyPollingIndex {
  if (value === undefined)
    return { version: 1, known: [], pending: [], baselines: {} };
  if (!value || typeof value !== 'object')
    throw new Error('Invalid polling index.');
  const data = value as LegacyPollingIndex;
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

export interface PendingEncounter extends LegacyPendingEncounter {
  readonly host: 'github.com';
  readonly key: string;
}

interface PollingIndexV2 {
  readonly version: 2;
  readonly known: readonly string[];
  /** V1 history had only GitHub.com API IDs; retain until seen again. */
  readonly legacyKnownIds: readonly number[];
  readonly pending: readonly PendingEncounter[];
  readonly baselines: LegacyPollingIndex['baselines'];
}

function decodeIndexV2(value: unknown): PollingIndexV2 {
  if (
    value === undefined ||
    (value as { version?: unknown } | null)?.version === 1
  ) {
    const legacy = decodeLegacyIndex(value);
    const pending = legacy.pending.map((item): PendingEncounter => ({
      ...item,
      host: 'github.com',
      key: pullRequestKey({ ...item, host: 'github.com' }),
    }));
    const migrated = new Set(pending.map((item) => item.id));
    return decodeIndexV2({
      version: 2,
      known: pending.map((item) => item.key),
      legacyKnownIds: legacy.known.filter((id) => !migrated.has(id)),
      pending,
      baselines: { ...legacy.baselines },
    });
  }
  const data = value as PollingIndexV2 | null;
  if (
    !data ||
    data.version !== 2 ||
    !Array.isArray(data.known) ||
    !data.known.every(isPullRequestKey) ||
    new Set(data.known).size !== data.known.length ||
    !Array.isArray(data.legacyKnownIds) ||
    !Array.isArray(data.pending)
  ) {
    throw new Error('Unsupported or invalid polling index.');
  }
  // Reuse strict v1 validation for retained IDs and pending reference metadata.
  decodeLegacyIndex({
    version: 1,
    known: data.legacyKnownIds,
    pending: [],
    baselines: data.baselines,
  });
  for (const item of data.pending) {
    decodeLegacyIndex({
      version: 1,
      known: [item?.id],
      pending: [item],
      baselines: data.baselines,
    });
  }
  const known = new Set(data.known);
  if (
    new Set(data.pending.map((item) => item.key)).size !==
      data.pending.length ||
    data.pending.some(
      (item) =>
        item.host !== 'github.com' ||
        item.key !== pullRequestKey(item) ||
        !known.has(item.key),
    )
  ) {
    throw new Error('Inconsistent polling identity.');
  }
  return data;
}

export interface Capture {
  readonly key: string;
  readonly source: PendingEncounter;
  readonly pokemon: PokemonAssignment;
  readonly capturedAt: string;
}

export type Presentation =
  | { readonly key: string; readonly status: 'pending' }
  | {
      readonly key: string;
      readonly status: 'shown';
      readonly shownAt: string;
    };

export interface PollingIndex extends Omit<PollingIndexV2, 'version'> {
  readonly version: 3;
  readonly captures: readonly Capture[];
  readonly presentations: readonly Presentation[];
}

export function decodeIndex(value: unknown): PollingIndex {
  const version = (value as { version?: unknown } | null)?.version;
  if (value === undefined || version === 1 || version === 2) {
    return {
      ...decodeIndexV2(value),
      version: 3,
      captures: [],
      presentations: [],
    };
  }
  if (!value || typeof value !== 'object' || version !== 3)
    throw new Error('Unsupported polling schema.');
  const data = value as PollingIndex;
  decodeIndexV2({ ...data, version: 2 });
  if (!Array.isArray(data.captures) || !Array.isArray(data.presentations))
    throw new Error('Invalid capture ledger.');
  const known = new Set(data.known);
  const pending = new Set(data.pending.map((item) => item.key));
  const captures = new Set<string>();
  for (const capture of data.captures) {
    if (
      !capture ||
      !isPullRequestKey(capture.key) ||
      captures.has(capture.key) ||
      pending.has(capture.key) ||
      !known.has(capture.key) ||
      typeof capture.capturedAt !== 'string' ||
      !Number.isFinite(Date.parse(capture.capturedAt)) ||
      !isPokemonAssignment(capture.pokemon) ||
      !capture.source ||
      capture.source.key !== capture.key
    )
      throw new Error('Invalid capture record.');
    decodeIndexV2({
      version: 2,
      known: [capture.key],
      pending: [capture.source],
      legacyKnownIds: [],
      baselines: {},
    });
    captures.add(capture.key);
  }
  const presentations = new Set<string>();
  for (const presentation of data.presentations) {
    if (
      !presentation ||
      !captures.has(presentation.key) ||
      presentations.has(presentation.key) ||
      (presentation.status !== 'pending' && presentation.status !== 'shown') ||
      (presentation.status === 'shown' &&
        (typeof presentation.shownAt !== 'string' ||
          !Number.isFinite(Date.parse(presentation.shownAt))))
    )
      throw new Error('Invalid presentation record.');
    presentations.add(presentation.key);
  }
  if (presentations.size !== captures.size)
    throw new Error('Missing presentation record.');
  return data;
}

/** Assignment and presentation intent are committed together, before any UI. */
export function capturePending(
  index: PollingIndex,
  capturedAt: string,
): PollingIndex {
  const captures = [...index.captures];
  const presentations = [...index.presentations];
  const keys = new Set(captures.map((capture) => capture.key));
  for (const source of index.pending) {
    if (keys.has(source.key)) continue;
    captures.push({
      key: source.key,
      source: { ...source },
      pokemon: assignPokemon(source.key),
      capturedAt,
    });
    presentations.push({ key: source.key, status: 'pending' });
    keys.add(source.key);
  }
  return { ...index, pending: [], captures, presentations };
}

export function markPresentationShown(
  index: PollingIndex,
  key: string,
  shownAt: string,
): PollingIndex {
  if (
    !index.presentations.some(
      (item) => item.key === key && item.status === 'pending',
    )
  )
    return index;
  if (!Number.isFinite(Date.parse(shownAt)))
    throw new Error('Invalid presentation date.');
  return {
    ...index,
    presentations: index.presentations.map((item) =>
      item.key === key ? { key, status: 'shown', shownAt } : item,
    ),
  };
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
  const legacyKnownIds = new Set(previous.legacyKnownIds);
  const pending = new Map(previous.pending.map((item) => [item.key, item]));
  const added: PendingEncounter[] = [];
  for (const pr of result.items) {
    const key = pullRequestKey(pr);
    const wasLegacy = pr.host === 'github.com' && legacyKnownIds.delete(pr.id);
    if (
      !wasLegacy &&
      !known.has(key) &&
      !pending.has(key) &&
      Date.parse(pr.createdAt) >= Date.parse(baseline)
    ) {
      const encounter: PendingEncounter = {
        key,
        host: pr.host,
        id: pr.id,
        owner: pr.owner,
        repository: pr.repository,
        number: pr.number,
        url: pr.url,
        detectedAt: startedAt,
        accessMode: mode,
        observedState: pr.state,
      };
      pending.set(key, encounter);
      added.push(encounter);
    }
    known.add(key);
  }
  return {
    index: {
      ...previous,
      version: 3,
      known: [...known],
      legacyKnownIds: [...legacyKnownIds],
      pending: [...pending.values()],
      baselines: { ...previous.baselines, [mode]: baseline },
    },
    added,
  };
}
