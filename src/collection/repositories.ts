import type { CollectionEntry } from './controller';

export interface RepositoryCollection {
  readonly key: string;
  readonly label: string;
  readonly entries: readonly CollectionEntry[];
}

/** Repositories are provenance, never configuration or a separate collection. */
export function groupByRepository(
  entries: readonly CollectionEntry[],
): readonly RepositoryCollection[] {
  const groups = new Map<
    string,
    { key: string; label: string; entries: CollectionEntry[] }
  >();
  for (const item of entries) {
    const source = item.capture.source;
    const label = `${source.owner}/${source.repository}`;
    const key = `${source.host}/${label.toLowerCase()}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, label, entries: [] };
      groups.set(key, group);
    }
    group.entries.push(structuredClone(item));
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
