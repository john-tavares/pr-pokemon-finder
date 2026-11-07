import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GitHubApiError,
  GitHubClient,
  parsePullRequestUrl,
  type GitHubErrorCode,
} from '../../src/github/client';

const reference = { owner: 'trainer', repository: 'pokemon', number: 42 };
const pr = {
  id: 900,
  number: 42,
  title: 'Add encounters',
  html_url: 'https://github.com/trainer/pokemon/pull/42',
  state: 'open',
  merged: false,
};
const tokens = { getAccessToken: async () => 'fake-secret' };
const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers });
const failure = (code: GitHubErrorCode) => (error: unknown) =>
  error instanceof GitHubApiError && error.code === code;

test('authenticated HTTPS requests use a fresh VS Code token and fixed API headers', async () => {
  let tokenRequests = 0;
  const requests: { url: string; init: RequestInit }[] = [];
  const client = new GitHubClient(
    { getAccessToken: async () => `session-${++tokenRequests}` },
    async (url, init) => {
      requests.push({ url: String(url), init: init! });
      return json({ id: 123, login: 'trainer' });
    },
  );
  assert.deepEqual(await client.getAuthenticatedUser(), {
    id: 123,
    login: 'trainer',
  });
  await client.getAuthenticatedUser();
  assert.equal(tokenRequests, 2);
  for (const [index, request] of requests.entries()) {
    assert.equal(request.url, 'https://api.github.com/user');
    assert.equal(request.init.method, 'GET');
    assert.equal(request.init.redirect, 'error');
    assert.ok(request.init.signal instanceof AbortSignal);
    const headers = new Headers(request.init.headers);
    assert.equal(headers.get('authorization'), `Bearer session-${index + 1}`);
    assert.equal(headers.get('accept'), 'application/vnd.github+json');
    assert.equal(headers.get('x-github-api-version'), '2022-11-28');
    assert.equal(headers.get('user-agent'), 'pr-pokemon-finder');
  }
  assert.equal(JSON.stringify(client).includes('session-'), false);
});

test('missing credentials never make an anonymous request', async () => {
  const client = new GitHubClient(
    { getAccessToken: async () => undefined },
    async () => {
      assert.fail('HTTP must not run.');
    },
  );
  await assert.rejects(
    client.getAuthenticatedUser(),
    failure('authentication-required'),
  );
});

test('provider failures are sanitized before leaving the client', async () => {
  const client = new GitHubClient({
    getAccessToken: async () => {
      throw new Error('fake-secret');
    },
  });
  await assert.rejects(client.getAuthenticatedUser(), (error: unknown) => {
    assert.ok(error instanceof GitHubApiError);
    assert.equal(error.code, 'authentication-unavailable');
    assert.equal(String(error).includes('fake-secret'), false);
    return true;
  });
});

test('known PRs are fetched and mapped without returning arbitrary API fields', async () => {
  const client = new GitHubClient(tokens, async (url) => {
    assert.equal(url, 'https://api.github.com/repos/trainer/pokemon/pulls/42');
    return json({ ...pr, body: 'private data not needed in the model' });
  });
  assert.deepEqual(await client.getPullRequest(reference), {
    ...reference,
    id: 900,
    title: 'Add encounters',
    url: pr.html_url,
    state: 'open',
    merged: false,
  });
});

test('closed and merged PRs retain their API distinction', async () => {
  for (const merged of [false, true]) {
    const client = new GitHubClient(tokens, async () =>
      json({ ...pr, state: 'closed', merged }),
    );
    const result = await client.getPullRequest(reference);
    assert.equal(result.state, 'closed');
    assert.equal(result.merged, merged);
  }
});

test('401 means expired credentials, while 403 and 404 are not treated as logout', async () => {
  for (const [status, code] of [
    [401, 'authentication-expired'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [500, 'service-unavailable'],
  ] as const) {
    const client = new GitHubClient(tokens, async () =>
      json({ message: 'untrusted fake-secret' }, status),
    );
    await assert.rejects(client.getAuthenticatedUser(), failure(code));
  }
});

test('unread error bodies are released after rejected credentials or unavailable resources', async () => {
  for (const status of [401, 404, 500]) {
    const response = json({ message: 'fake-secret' }, status);
    const client = new GitHubClient(tokens, async () => response);
    await assert.rejects(client.getAuthenticatedUser());
    assert.equal(response.bodyUsed, true);
  }
});

test('network, timeout, and redirect failures do not leak request details', async () => {
  for (const name of ['Error', 'TimeoutError', 'AbortError']) {
    const client = new GitHubClient(tokens, async () => {
      const error = new Error('Bearer fake-secret');
      error.name = name;
      throw error;
    });
    await assert.rejects(client.getAuthenticatedUser(), (error: unknown) => {
      assert.ok(error instanceof GitHubApiError);
      assert.equal(error.code, 'network');
      assert.equal(String(error).includes('fake-secret'), false);
      return true;
    });
  }
});

test('invalid JSON and malformed user models produce safe response errors', async () => {
  for (const response of [
    new Response('not JSON'),
    json([]),
    json({ id: 1 }),
    json({ id: -1, login: 'trainer' }),
  ]) {
    const client = new GitHubClient(tokens, async () => response);
    await assert.rejects(
      client.getAuthenticatedUser(),
      failure('invalid-response'),
    );
  }
});

test('malformed PR models and off-origin response URLs are rejected', async () => {
  for (const change of [
    { number: 2 },
    { merged: null },
    { state: 'unknown' },
    { html_url: 'https://evil.example/pull/42' },
    { id: '900' },
    { title: null },
  ]) {
    const client = new GitHubClient(tokens, async () =>
      json({ ...pr, ...change }),
    );
    await assert.rejects(
      client.getPullRequest(reference),
      failure('invalid-response'),
    );
  }
});

test('primary rate limits honor reset and prevent repeated requests until the cooldown expires', async () => {
  let now = 1_000_000;
  let calls = 0;
  const client = new GitHubClient(
    tokens,
    async () =>
      ++calls === 1
        ? json({}, 403, {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1120',
          })
        : json({ id: 123, login: 'trainer' }),
    () => now,
  );
  await assert.rejects(client.getAuthenticatedUser(), (error: unknown) => {
    assert.ok(error instanceof GitHubApiError);
    assert.equal(error.code, 'rate-limited');
    assert.equal(error.retryAfterSeconds, 120);
    return true;
  });
  await assert.rejects(client.getAuthenticatedUser(), failure('rate-limited'));
  assert.equal(calls, 1);
  now += 120_000;
  await client.getAuthenticatedUser();
  assert.equal(calls, 2);
});

test('secondary limits honor Retry-After and do not trigger automatic retries', async () => {
  let calls = 0;
  const client = new GitHubClient(tokens, async () => {
    calls++;
    return json({}, 429, { 'retry-after': '180' });
  });
  await assert.rejects(
    client.getAuthenticatedUser(),
    (error: unknown) =>
      error instanceof GitHubApiError && error.retryAfterSeconds === 180,
  );
  assert.equal(calls, 1);
});

test('secondary 403 limits and malformed headers fall back to a bounded retry policy', async () => {
  const client = new GitHubClient(tokens, async () =>
    json({ message: 'You have exceeded a secondary rate limit.' }, 403, {
      'retry-after': 'invalid',
    }),
  );
  await assert.rejects(
    client.getAuthenticatedUser(),
    (error: unknown) =>
      error instanceof GitHubApiError &&
      error.code === 'rate-limited' &&
      error.retryAfterSeconds === 60,
  );
});

test('only canonical HTTPS GitHub PR URLs are accepted', () => {
  for (const suffix of [
    '',
    '/',
    '/files',
    '/commits',
    '/checks',
    '#discussion',
    '?diff=split',
  ]) {
    assert.deepEqual(
      parsePullRequestUrl(
        `https://github.com/trainer/pokemon/pull/42${suffix}`,
      ),
      reference,
    );
  }
  for (const input of [
    'http://github.com/trainer/pokemon/pull/42',
    'https://evil.example/trainer/pokemon/pull/42',
    'https://github.com@evil.example/trainer/pokemon/pull/42',
    'https://user:pass@github.com/trainer/pokemon/pull/42',
    'https://github.com/trainer/pokemon/issues/42',
    'https://github.com/trainer/pokemon/pull/0',
    'https://github.com/trainer/pokemon/pull/9007199254740992',
    'not a URL',
  ]) {
    assert.equal(parsePullRequestUrl(input), undefined, input);
  }
});

test('invalid references are rejected before credentials or HTTP are requested', async () => {
  const client = new GitHubClient({
    getAccessToken: async () => {
      assert.fail('No token lookup for invalid input.');
    },
  });
  for (const change of [
    { owner: '../evil' },
    { repository: '..' },
    { repository: 'repo/other' },
    { number: 0 },
    { number: 1.5 },
  ]) {
    await assert.rejects(
      client.getPullRequest({ ...reference, ...change }),
      failure('invalid-pull-request'),
    );
  }
});
