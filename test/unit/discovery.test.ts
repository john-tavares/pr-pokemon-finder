import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GitHubApiError,
  GitHubClient,
  type GitHubUser,
} from '../../src/github/client';
import {
  discoverPullRequests,
  type DiscoveryClient,
} from '../../src/github/discovery';
import { githubScopes } from '../../src/auth/scopes';

const account = { id: 123, login: 'trainer' };
const timestamp = '2026-11-01T10:00:00Z';
function pull(id: number, owner = 'team-one', repository = 'project') {
  return {
    id,
    number: id,
    title: `PR ${id}`,
    html_url: `https://github.com/${owner}/${repository}/pull/${id}`,
    repository_url: `https://api.github.com/repos/${owner}/${repository}`,
    state: 'open',
    created_at: timestamp,
    updated_at: timestamp,
    closed_at: null,
    pull_request: { merged_at: null },
    body: 'not retained',
  };
}
const page = (items: unknown[], total = items.length, incomplete = false) => ({
  items,
  total_count: total,
  incomplete_results: incomplete,
});
const clientFor = (response: unknown): DiscoveryClient => ({
  getAuthenticatedUser: async () => account,
  getPullRequestSearchPage: async () => response,
});
const invalid = (error: unknown) =>
  error instanceof GitHubApiError && error.code === 'invalid-response';

test('discovery deduplicates by canonical PR identity rather than response ID', async () => {
  const original = pull(1);
  const duplicate = {
    ...pull(99, 'TEAM-ONE', 'PROJECT'),
    number: 1,
    html_url: 'https://github.com/TEAM-ONE/PROJECT/pull/1',
  };
  const other = {
    ...pull(2, 'other-team'),
    number: 1,
    html_url: 'https://github.com/other-team/project/pull/1',
  };
  const result = await discoverPullRequests(
    clientFor(page([original, duplicate, other])),
    { includePrivate: false },
  );
  assert.equal(result.items.length, 2);
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.items.map((item) => item.number),
    [1, 1],
  );
});

test('discovers authored PRs across repositories without workspace or remote configuration', async () => {
  const requests: string[] = [];
  const client = new GitHubClient(
    { getAccessToken: async () => 'fake-token' },
    async (input) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.pathname === '/user') return Response.json(account);
      assert.equal(url.searchParams.get('q'), 'is:pr author:trainer is:public');
      assert.equal(url.searchParams.get('per_page'), '100');
      assert.equal(url.searchParams.get('page'), '1');
      assert.equal(url.searchParams.get('sort'), 'updated');
      return Response.json(
        page([pull(1), pull(2, 'another-team', 'another-repo')]),
      );
    },
  );
  const result = await discoverPullRequests(client, { includePrivate: false });
  assert.equal(result.complete, true);
  assert.equal(result.totalCount, 2);
  assert.deepEqual(
    result.items.map((item) => [item.owner, item.repository]),
    [
      ['team-one', 'project'],
      ['another-team', 'another-repo'],
    ],
  );
  assert.deepEqual(result.items[0], {
    host: 'github.com',
    id: 1,
    owner: 'team-one',
    repository: 'project',
    number: 1,
    title: 'PR 1',
    url: 'https://github.com/team-one/project/pull/1',
    state: 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: null,
    mergedAt: null,
  });
  assert.deepEqual(requests, ['/user', '/search/issues', '/user']);
  assert.equal(JSON.stringify(result).includes('not retained'), false);
});

test('private mode uses account permissions and omits the public-only search restriction', async () => {
  const client = new GitHubClient(
    { getAccessToken: async () => 'fake-token' },
    async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/user') return Response.json(account);
      assert.equal(url.searchParams.get('q'), 'is:pr author:trainer');
      return Response.json(page([pull(10, 'private-team', 'private-repo')]));
    },
  );
  const result = await discoverPullRequests(client, { includePrivate: true });
  assert.equal(result.items[0]?.repository, 'private-repo');
});

test('paginates sequentially and does not stop after the first hundred results', async () => {
  const pages: number[] = [];
  let active = false;
  const client: DiscoveryClient = {
    getAuthenticatedUser: async () => account,
    getPullRequestSearchPage: async (login, number) => {
      assert.equal(login, account.login);
      assert.equal(active, false);
      active = true;
      await Promise.resolve();
      pages.push(number);
      active = false;
      return number === 1
        ? page(
            Array.from({ length: 100 }, (_, i) => pull(i + 1)),
            101,
          )
        : page([pull(101)], 101);
    },
  };
  const result = await discoverPullRequests(client, { includePrivate: false });
  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.items.length, 101);
  assert.equal(result.complete, true);
});

test('GitHub search ceiling is explicit and never requests page eleven', async () => {
  let pages = 0;
  const client: DiscoveryClient = {
    getAuthenticatedUser: async () => account,
    getPullRequestSearchPage: async (_login, number) => {
      pages++;
      return page(
        Array.from({ length: 100 }, (_, i) => pull((number - 1) * 100 + i + 1)),
        1500,
      );
    },
  };
  const result = await discoverPullRequests(client, { includePrivate: true });
  assert.equal(pages, 10);
  assert.equal(result.items.length, 1000);
  assert.equal(result.totalCount, 1500);
  assert.equal(result.complete, false);
});

test('incomplete and unexpectedly short batches never claim completeness', async () => {
  for (const response of [
    page([pull(1)], 1, true),
    page([pull(1)], 2),
    page([], 2),
  ]) {
    const result = await discoverPullRequests(clientFor(response), {
      includePrivate: false,
    });
    assert.equal(result.complete, false);
  }
});

test('duplicates from shifting search pages are deduplicated and mark the batch incomplete', async () => {
  const client = clientFor(
    page(
      Array.from({ length: 100 }, (_, i) => pull(i + 1)),
      200,
    ),
  );
  const result = await discoverPullRequests(client, { includePrivate: false });
  assert.equal(result.items.length, 100);
  assert.equal(result.complete, false);
});

test('changed totals during pagination mark even otherwise matching counts incomplete', async () => {
  const client: DiscoveryClient = {
    getAuthenticatedUser: async () => account,
    getPullRequestSearchPage: async (_login, number) =>
      number === 1
        ? page(
            Array.from({ length: 100 }, (_, i) => pull(i + 1)),
            101,
          )
        : page([pull(101), pull(102)], 102),
  };
  const result = await discoverPullRequests(client, { includePrivate: false });
  assert.equal(result.items.length, 102);
  assert.equal(result.complete, false);
});

test('empty searches are complete and return an empty list', async () => {
  const result = await discoverPullRequests(clientFor(page([])), {
    includePrivate: false,
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.items, []);
});

test('closed state and date metadata are retained without inventing merge data', async () => {
  const result = await discoverPullRequests(
    clientFor(
      page([
        { ...pull(1), state: 'closed', closed_at: timestamp, pull_request: {} },
      ]),
    ),
    { includePrivate: false },
  );
  assert.equal(result.items[0]?.state, 'closed');
  assert.equal(result.items[0]?.closedAt, timestamp);
  assert.equal(result.items[0]?.mergedAt, undefined);
});

test('malformed search and PR metadata are rejected instead of silently dropping entries', async () => {
  const badItems = [
    { ...pull(1), pull_request: undefined },
    { ...pull(1), created_at: 'invalid' },
    { ...pull(1), html_url: 'https://evil.example/team/project/pull/1' },
    {
      ...pull(1),
      repository_url: 'https://api.github.com/repos/wrong/project',
    },
    { ...pull(1), number: 999 },
    { ...pull(1), state: 'unexpected' },
    { ...pull(1), pull_request: { merged_at: 'invalid' } },
  ];
  for (const response of [
    { items: [], total_count: -1, incomplete_results: false },
    { items: [], total_count: 0 },
    ...badItems.map((item) => page([item])),
  ]) {
    await assert.rejects(
      discoverPullRequests(clientFor(response), { includePrivate: false }),
      invalid,
    );
  }
});

test('a failed later page does not publish a successful partial batch', async () => {
  const client: DiscoveryClient = {
    getAuthenticatedUser: async () => account,
    getPullRequestSearchPage: async (_login, number) => {
      if (number === 2) throw new GitHubApiError('forbidden');
      return page(
        Array.from({ length: 100 }, (_, i) => pull(i + 1)),
        101,
      );
    },
  };
  await assert.rejects(
    discoverPullRequests(client, { includePrivate: true }),
    (error) => error instanceof GitHubApiError && error.code === 'forbidden',
  );
});

test('cancellation is checked before authentication and after each response', async () => {
  const client: DiscoveryClient = {
    getAuthenticatedUser: async () => {
      assert.fail('Canceled before authentication.');
    },
    getPullRequestSearchPage: async () => {
      assert.fail('Canceled before HTTP.');
    },
  };
  await assert.rejects(
    discoverPullRequests(client, {
      includePrivate: false,
      isCanceled: () => true,
    }),
    (error) =>
      error instanceof GitHubApiError && error.code === 'discovery-canceled',
  );
  let canceled = false;
  const other: DiscoveryClient = {
    getAuthenticatedUser: async () => account,
    getPullRequestSearchPage: async () => {
      canceled = true;
      return page([pull(1)]);
    },
  };
  await assert.rejects(
    discoverPullRequests(other, {
      includePrivate: false,
      isCanceled: () => canceled,
    }),
    (error) =>
      error instanceof GitHubApiError && error.code === 'discovery-canceled',
  );
});

test('account switches during discovery discard the batch', async () => {
  let calls = 0;
  const client: DiscoveryClient = {
    getAuthenticatedUser: async (): Promise<GitHubUser> =>
      ++calls === 1 ? account : { id: 456, login: 'different-user' },
    getPullRequestSearchPage: async () => page([pull(1)]),
  };
  await assert.rejects(
    discoverPullRequests(client, { includePrivate: false }),
    (error) =>
      error instanceof GitHubApiError && error.code === 'account-changed',
  );
});

test('search rejects query injection and unbounded page numbers before credentials are accessed', async () => {
  const client = new GitHubClient({
    getAccessToken: async () => {
      assert.fail('No credential lookup for invalid search parameters.');
    },
  });
  for (const [login, number] of [
    ['trainer OR author:other', 1],
    ['trainer', 0],
    ['trainer', 11],
    ['trainer', 1.5],
  ] as const) {
    await assert.rejects(
      client.getPullRequestSearchPage(login, number, false),
      invalid,
    );
  }
});

test('public mode never requests repo scope; private mode adds only repo', () => {
  assert.deepEqual(githubScopes(false), ['read:user']);
  assert.deepEqual(githubScopes(true), ['read:user', 'repo']);
});
