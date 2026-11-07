import { GitHubApiError, parsePullRequestUrl, type GitHubUser } from './client';

export interface DiscoveredPullRequest {
  readonly host: 'github.com';
  readonly id: number;
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: 'open' | 'closed';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
  /** Search may omit this field; missing is not proof that a PR was not merged. */
  readonly mergedAt: string | null | undefined;
}

export interface DiscoveryResult {
  readonly account: GitHubUser;
  readonly items: readonly DiscoveredPullRequest[];
  readonly totalCount: number;
  readonly complete: boolean;
}

export interface DiscoveryClient {
  getAuthenticatedUser(): Promise<GitHubUser>;
  getPullRequestSearchPage(
    login: string,
    page: number,
    includePrivate: boolean,
  ): Promise<unknown>;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GitHubApiError('invalid-response');
  return value as Record<string, unknown>;
}

function date(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function mapPullRequest(value: unknown): DiscoveredPullRequest {
  const item = record(value);
  const pull = record(item.pull_request);
  const reference =
    typeof item.html_url === 'string'
      ? parsePullRequestUrl(item.html_url)
      : undefined;
  if (
    !reference ||
    !Number.isSafeInteger(item.id) ||
    (item.id as number) <= 0 ||
    item.number !== reference.number ||
    typeof item.title !== 'string' ||
    (item.state !== 'open' && item.state !== 'closed') ||
    !date(item.created_at) ||
    !date(item.updated_at) ||
    (item.closed_at !== null && !date(item.closed_at)) ||
    (pull.merged_at !== undefined &&
      pull.merged_at !== null &&
      !date(pull.merged_at))
  ) {
    throw new GitHubApiError('invalid-response');
  }
  // Validate repository identity independently of the browser URL.
  let repository: URL;
  try {
    repository = new URL(String(item.repository_url));
  } catch {
    throw new GitHubApiError('invalid-response');
  }
  if (
    repository.origin !== 'https://api.github.com' ||
    repository.username ||
    repository.password ||
    repository.search ||
    repository.hash ||
    repository.pathname.toLowerCase() !==
      `/repos/${reference.owner}/${reference.repository}`.toLowerCase()
  ) {
    throw new GitHubApiError('invalid-response');
  }
  return {
    host: 'github.com',
    ...reference,
    id: item.id as number,
    title: item.title,
    url: item.html_url as string,
    state: item.state,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    closedAt: item.closed_at,
    mergedAt: pull.merged_at as string | null | undefined,
  };
}

export async function discoverPullRequests(
  client: DiscoveryClient,
  options: { includePrivate: boolean; isCanceled?: () => boolean },
): Promise<DiscoveryResult> {
  const checkCancellation = () => {
    if (options.isCanceled?.()) throw new GitHubApiError('discovery-canceled');
  };
  checkCancellation();
  const account = await client.getAuthenticatedUser();
  const items = new Map<number, DiscoveredPullRequest>();
  let totalCount: number | undefined;
  let complete = true;
  let received = 0;
  for (let page = 1; page <= 10; page++) {
    checkCancellation();
    const data = record(
      await client.getPullRequestSearchPage(
        account.login,
        page,
        options.includePrivate,
      ),
    );
    checkCancellation();
    if (
      !Number.isSafeInteger(data.total_count) ||
      (data.total_count as number) < 0 ||
      typeof data.incomplete_results !== 'boolean' ||
      !Array.isArray(data.items) ||
      data.items.length > 100
    ) {
      throw new GitHubApiError('invalid-response');
    }
    const count = data.total_count as number;
    if (totalCount !== undefined && totalCount !== count) complete = false;
    totalCount = Math.max(totalCount ?? 0, count);
    if (data.incomplete_results || totalCount > 1000) complete = false;
    received += data.items.length;
    for (const value of data.items) {
      const item = mapPullRequest(value);
      if (items.has(item.id)) complete = false;
      items.set(item.id, item);
    }
    if (data.items.length < 100 || received >= totalCount) break;
  }
  if (items.size !== totalCount) complete = false;
  checkCancellation();
  // Never present another account's batch after a session switch during pagination.
  const current = await client.getAuthenticatedUser();
  checkCancellation();
  if (current.id !== account.id || current.login !== account.login)
    throw new GitHubApiError('account-changed');
  return {
    account,
    items: [...items.values()],
    totalCount: totalCount ?? 0,
    complete,
  };
}
