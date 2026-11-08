export interface AccessTokenProvider {
  getAccessToken(): Promise<string | undefined>;
}

/** Fixed transport policy: there is no configurable proxy or custom backend. */
export const GITHUB_API_POLICY = Object.freeze({
  origin: 'https://api.github.com',
  method: 'GET',
  version: '2022-11-28',
  timeoutMilliseconds: 10_000,
  maximumCooldownSeconds: 86_400,
} as const);

export type GitHubErrorCode =
  | 'authentication-required'
  | 'authentication-expired'
  | 'authentication-unavailable'
  | 'forbidden'
  | 'not-found'
  | 'rate-limited'
  | 'network'
  | 'invalid-response'
  | 'invalid-pull-request'
  | 'discovery-canceled'
  | 'account-changed'
  | 'service-unavailable';

/** Contains only sanitized metadata; never attach the HTTP response or its body. */
export class GitHubApiError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(`GitHub API: ${code}`);
    this.name = 'GitHubApiError';
  }
}

export interface PullRequestReference {
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
}

export interface GitHubPullRequest extends PullRequestReference {
  readonly id: number;
  readonly title: string;
  readonly url: string;
  readonly state: 'open' | 'closed';
  readonly merged: boolean;
}

export interface GitHubUser {
  readonly id: number;
  readonly login: string;
}

function validReference(reference: PullRequestReference): boolean {
  return (
    typeof reference.owner === 'string' &&
    typeof reference.repository === 'string' &&
    /^[a-z0-9][a-z0-9-]{0,38}$/i.test(reference.owner) &&
    /^[a-z0-9_.-]{1,100}$/i.test(reference.repository) &&
    reference.repository !== '.' &&
    reference.repository !== '..' &&
    Number.isSafeInteger(reference.number) &&
    reference.number > 0
  );
}

export function parsePullRequestUrl(
  input: string,
): PullRequestReference | undefined {
  try {
    const url = new URL(input.trim());
    if (url.origin !== 'https://github.com' || url.username || url.password)
      return;
    const match =
      /^\/([^/]+)\/([^/]+)\/pull\/([1-9]\d*)(?:\/(?:files|commits|checks))?\/?$/.exec(
        url.pathname,
      );
    if (!match) return;
    const reference = {
      owner: match[1]!,
      repository: match[2]!,
      number: Number(match[3]),
    };
    return validReference(reference) ? reference : undefined;
  } catch {
    return undefined;
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export class GitHubClient {
  private blockedUntil = 0;

  constructor(
    private readonly tokens: AccessTokenProvider,
    private readonly request: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async getAuthenticatedUser(): Promise<GitHubUser> {
    const data = object(await this.get('/user'));
    if (
      !data ||
      !positiveId(data.id) ||
      typeof data.login !== 'string' ||
      !data.login
    ) {
      throw new GitHubApiError('invalid-response');
    }
    return { id: data.id, login: data.login };
  }

  async getPullRequest(
    reference: PullRequestReference,
  ): Promise<GitHubPullRequest> {
    if (!validReference(reference))
      throw new GitHubApiError('invalid-pull-request');
    const { owner, repository, number } = reference;
    const data = object(
      await this.get(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${number}`,
      ),
    );
    if (
      !data ||
      !positiveId(data.id) ||
      data.number !== number ||
      typeof data.title !== 'string' ||
      typeof data.html_url !== 'string' ||
      (data.state !== 'open' && data.state !== 'closed') ||
      typeof data.merged !== 'boolean'
    ) {
      throw new GitHubApiError('invalid-response');
    }
    const canonical = parsePullRequestUrl(data.html_url);
    if (
      !canonical ||
      canonical.number !== number ||
      canonical.owner.toLowerCase() !== owner.toLowerCase() ||
      canonical.repository.toLowerCase() !== repository.toLowerCase()
    )
      throw new GitHubApiError('invalid-response');
    return {
      ...reference,
      id: data.id,
      title: data.title,
      url: data.html_url,
      state: data.state,
      merged: data.merged,
    };
  }

  async getPullRequestSearchPage(
    login: string,
    page: number,
    includePrivate: boolean,
  ): Promise<unknown> {
    if (
      !/^[a-z0-9][a-z0-9-]{0,38}$/i.test(login) ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 10
    ) {
      throw new GitHubApiError('invalid-response');
    }
    const query = `is:pr author:${login}${includePrivate ? '' : ' is:public'}`;
    return this.get(
      `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${page}`,
    );
  }

  private async get(path: string): Promise<unknown> {
    if (this.blockedUntil > this.now()) {
      throw new GitHubApiError(
        'rate-limited',
        Math.ceil((this.blockedUntil - this.now()) / 1000),
      );
    }
    let token: string | undefined;
    try {
      token = await this.tokens.getAccessToken();
    } catch {
      throw new GitHubApiError('authentication-unavailable');
    }
    if (!token) throw new GitHubApiError('authentication-required');

    let response: Response;
    try {
      response = await this.request(`${GITHUB_API_POLICY.origin}${path}`, {
        method: GITHUB_API_POLICY.method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_POLICY.version,
          'User-Agent': 'pr-pokemon-finder',
        },
        // Do not forward authorization to a redirect target supplied by a response.
        redirect: 'error',
        signal: AbortSignal.timeout(GITHUB_API_POLICY.timeoutMilliseconds),
      });
    } catch {
      throw new GitHubApiError('network');
    } finally {
      token = undefined;
    }

    if (response.status === 401)
      return this.rejectResponse(response, 'authentication-expired');
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      const retry = Number(response.headers.get('retry-after'));
      // Secondary limits may only be identified by the response message.
      let rateMessage = false;
      try {
        const data = object(await response.json());
        rateMessage =
          typeof data?.message === 'string' &&
          /rate limit|abuse detection/i.test(data.message);
      } catch {
        /* Do not expose untrusted response bodies. */
      }
      if (
        response.status === 429 ||
        remaining === '0' ||
        retry > 0 ||
        rateMessage
      ) {
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        const wait = Math.min(
          GITHUB_API_POLICY.maximumCooldownSeconds,
          Math.max(
            Number.isFinite(retry) && retry > 0 ? retry : 0,
            remaining === '0' && Number.isFinite(reset)
              ? Math.ceil((reset - this.now()) / 1000)
              : 0,
            60,
          ),
        );
        this.blockedUntil = this.now() + wait * 1000;
        throw new GitHubApiError('rate-limited', wait);
      }
      throw new GitHubApiError('forbidden');
    }
    if (response.status === 404)
      return this.rejectResponse(response, 'not-found');
    if (!response.ok)
      return this.rejectResponse(response, 'service-unavailable');
    try {
      return await response.json();
    } catch {
      throw new GitHubApiError('invalid-response');
    }
  }

  private async rejectResponse(
    response: Response,
    code: GitHubErrorCode,
  ): Promise<never> {
    // Release unread error bodies so repeated failures cannot exhaust HTTP connections.
    await response.body?.cancel().catch(() => undefined);
    throw new GitHubApiError(code);
  }
}
