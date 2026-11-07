export interface PullRequestIdentity {
  readonly host: string;
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
}

/** A versioned, case-insensitive locator, independent of API response IDs. */
export function pullRequestKey(identity: PullRequestIdentity): string {
  const { host, owner, repository, number } = identity;
  if (
    typeof host !== 'string' ||
    host.length > 253 ||
    !host
      .split('.')
      .every((label) =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
      ) ||
    typeof owner !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{0,38}$/i.test(owner) ||
    typeof repository !== 'string' ||
    !/^[a-z0-9_.-]{1,100}$/i.test(repository) ||
    repository === '.' ||
    repository === '..' ||
    !Number.isSafeInteger(number) ||
    number <= 0
  )
    throw new Error('Invalid pull request identity.');
  return `pr:v1:${host.toLowerCase()}/${owner.toLowerCase()}/${repository.toLowerCase()}/${number}`;
}

export function isPullRequestKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^pr:v1:([^/]+)\/([^/]+)\/([^/]+)\/([1-9]\d*)$/.exec(value);
  if (!match) return false;
  try {
    return (
      pullRequestKey({
        host: match[1]!,
        owner: match[2]!,
        repository: match[3]!,
        number: Number(match[4]),
      }) === value
    );
  } catch {
    return false;
  }
}
