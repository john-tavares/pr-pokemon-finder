import assert from 'node:assert/strict';
import test from 'node:test';
import { isPullRequestKey, pullRequestKey } from '../../src/github/identity';
import { parsePullRequestUrl } from '../../src/github/client';

const identity = {
  host: 'github.com',
  owner: 'trainer',
  repository: 'repo',
  number: 42,
};

test('same PR has a stable canonical versioned key regardless of casing', () => {
  assert.equal(pullRequestKey(identity), 'pr:v1:github.com/trainer/repo/42');
  assert.equal(
    pullRequestKey({
      ...identity,
      host: 'GitHub.COM',
      owner: 'Trainer',
      repository: 'REPO',
    }),
    pullRequestKey(identity),
  );
  assert.ok(isPullRequestKey(pullRequestKey(identity)));
  assert.ok(!isPullRequestKey('pr:v1:github.com/Trainer/repo/42'));
});

test('host, owner, repository and PR number each participate in identity', () => {
  const keys = [
    identity,
    { ...identity, host: 'github.example.com' },
    { ...identity, owner: 'other' },
    { ...identity, repository: 'other' },
    { ...identity, number: 43 },
  ].map(pullRequestKey);
  assert.equal(new Set(keys).size, 5);
});

test('URL suffixes and display-only metadata do not change PR identity', () => {
  for (const suffix of [
    '',
    '/',
    '/files?diff=split#L1',
    '/commits',
    '/checks',
  ]) {
    const reference = parsePullRequestUrl(
      `https://github.com/Trainer/Repo/pull/42${suffix}`,
    );
    assert.ok(reference);
    assert.equal(
      pullRequestKey({ host: 'github.com', ...reference }),
      pullRequestKey(identity),
    );
  }
});

test('ambiguous, unsafe and malformed identity components are rejected', () => {
  for (const change of [
    { host: '' },
    { host: 'https://github.com' },
    { host: 'github.com:443' },
    { host: 'github.com.' },
    { host: 'a..b' },
    { host: '-host' },
    { owner: 'a/b' },
    { owner: ' trainer' },
    { repository: '..' },
    { repository: 'a/b' },
    { repository: 'a%2fb' },
    { number: 0 },
    { number: -1 },
    { number: 1.2 },
    { number: Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.throws(() => pullRequestKey({ ...identity, ...change }));
  for (const input of [
    null,
    42,
    '',
    'pr:v2:github.com/a/b/1',
    'pr:v1:github.com/a/b/01',
  ])
    assert.ok(!isPullRequestKey(input));
});
