import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuthenticationController,
  type AccountSession,
  type SessionProvider,
  type SessionRequest,
} from '../../src/auth/authentication';
import {
  authenticationPresentation,
  SIGN_IN_COMMAND,
  STATUS_COMMAND,
} from '../../src/auth/status';

const session: AccountSession = { account: { id: '123', label: 'trainer' } };

class FakeProvider implements SessionProvider {
  requests: SessionRequest[] = [];
  lookup: (options: SessionRequest) => Promise<AccountSession | undefined> =
    async () => undefined;
  listener: ((providerId: string) => void) | undefined;
  disposed = false;

  async getSession(options: SessionRequest) {
    this.requests.push(options);
    return this.lookup(options);
  }

  onDidChangeSessions(listener: (providerId: string) => void) {
    this.listener = listener;
    return {
      dispose: () => {
        this.disposed = true;
        this.listener = undefined;
      },
    };
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('restores a session silently and reuses it in a new controller', async () => {
  const provider = new FakeProvider();
  provider.lookup = async () => session;
  const first = new AuthenticationController(provider);
  await first.restore();
  assert.deepEqual(first.state, {
    status: 'connected',
    accountLabel: 'trainer',
  });
  first.dispose();
  const second = new AuthenticationController(provider);
  await second.restore();
  assert.deepEqual(second.state, {
    status: 'connected',
    accountLabel: 'trainer',
  });
  assert.deepEqual(provider.requests, [{ silent: true }, { silent: true }]);
  second.dispose();
});

test('activation without a session stays disconnected and never requests interactive login', async () => {
  const provider = new FakeProvider();
  const controller = new AuthenticationController(provider);
  await controller.restore();
  assert.deepEqual(controller.state, { status: 'disconnected' });
  assert.deepEqual(provider.requests, [{ silent: true }]);
  controller.dispose();
});

test('explicit sign-in requests creation and publishes account information only', async () => {
  const provider = new FakeProvider();
  provider.lookup = async () => ({
    ...session,
    accessToken: 'secret-not-for-state',
  });
  const controller = new AuthenticationController(provider);
  const states: unknown[] = [];
  controller.onDidChangeState((state) => states.push(state));
  await controller.signIn();
  assert.deepEqual(provider.requests, [{ createIfNone: true }]);
  assert.deepEqual(states, [
    { status: 'signing-in' },
    { status: 'connected', accountLabel: 'trainer' },
  ]);
  assert.equal(JSON.stringify(states).includes('secret-not-for-state'), false);
  await controller.signIn();
  assert.equal(provider.requests.length, 1);
  controller.dispose();
});

test('cancellation or failure leaves a disconnected state and permits retry', async () => {
  const provider = new FakeProvider();
  provider.lookup = async () => {
    throw new Error('sensitive-provider-error');
  };
  const controller = new AuthenticationController(provider);
  await controller.signIn();
  assert.deepEqual(controller.state, { status: 'disconnected' });
  provider.lookup = async () => session;
  await controller.signIn();
  assert.equal(controller.state.status, 'connected');
  assert.equal(provider.requests.length, 2);
  controller.dispose();
});

test('repeated login requests share one interactive flow', async () => {
  const provider = new FakeProvider();
  let finish!: (value: AccountSession) => void;
  provider.lookup = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const controller = new AuthenticationController(provider);
  const first = controller.signIn();
  const second = controller.signIn();
  assert.equal(first, second);
  await flush();
  assert.equal(provider.requests.length, 1);
  finish(session);
  await first;
  controller.dispose();
});

test('GitHub removal and account changes update state; other providers are ignored', async () => {
  const provider = new FakeProvider();
  provider.lookup = async () => session;
  const controller = new AuthenticationController(provider);
  await controller.restore();
  provider.listener?.('microsoft');
  await flush();
  assert.equal(provider.requests.length, 1);
  provider.lookup = async () => undefined;
  provider.listener?.('github');
  await flush();
  assert.equal(controller.state.status, 'disconnected');
  provider.lookup = async () => ({
    account: { id: '456', label: 'another-trainer' },
  });
  provider.listener?.('github');
  await flush();
  assert.deepEqual(controller.state, {
    status: 'connected',
    accountLabel: 'another-trainer',
  });
  controller.dispose();
});

test('a stale startup lookup cannot overwrite a completed login', async () => {
  const provider = new FakeProvider();
  let finishRestore!: (value: undefined) => void;
  provider.lookup = async (options) =>
    'silent' in options
      ? new Promise((resolve) => {
          finishRestore = resolve;
        })
      : session;
  const controller = new AuthenticationController(provider);
  const restore = controller.restore();
  await controller.signIn();
  finishRestore(undefined);
  await restore;
  assert.equal(controller.state.status, 'connected');
  controller.dispose();
});

test('a session event during interactive login is reconciled after it completes', async () => {
  const provider = new FakeProvider();
  let finish!: (value: AccountSession) => void;
  provider.lookup = async (options) =>
    'createIfNone' in options
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : undefined;
  const controller = new AuthenticationController(provider);
  const login = controller.signIn();
  await flush();
  provider.listener?.('github');
  finish(session);
  await login;
  assert.deepEqual(provider.requests, [
    { createIfNone: true },
    { silent: true },
  ]);
  assert.equal(controller.state.status, 'disconnected');
  controller.dispose();
});

test('silent provider failures are safe, retryable, and do not leak error content', async () => {
  const provider = new FakeProvider();
  provider.lookup = async () => {
    throw new Error('sensitive-provider-error');
  };
  const controller = new AuthenticationController(provider);
  await controller.restore();
  assert.deepEqual(controller.state, { status: 'unavailable' });
  assert.equal(
    authenticationPresentation(controller.state).message.includes('sensitive'),
    false,
  );
  provider.lookup = async () => session;
  await controller.signIn();
  assert.equal(controller.state.status, 'connected');
  controller.dispose();
});

test('disposal unsubscribes and prevents late requests from publishing state', async () => {
  const provider = new FakeProvider();
  let finish!: (value: AccountSession) => void;
  provider.lookup = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const controller = new AuthenticationController(provider);
  let changes = 0;
  controller.onDidChangeState(() => changes++);
  const restore = controller.restore();
  controller.dispose();
  finish(session);
  await restore;
  await controller.signIn();
  assert.equal(changes, 0);
  assert.equal(provider.disposed, true);
  assert.equal(controller.state.status, 'disconnected');
});

test('status presentation always offers a useful action and textual accessible feedback', () => {
  for (const status of ['disconnected', 'unavailable'] as const) {
    const presentation = authenticationPresentation({ status });
    assert.equal(presentation.command, SIGN_IN_COMMAND);
    assert.ok(presentation.tooltip.length > 0);
  }
  const connected = authenticationPresentation({
    status: 'connected',
    accountLabel: 'trainer',
  });
  assert.equal(connected.command, STATUS_COMMAND);
  assert.match(connected.message, /trainer/);
  assert.match(
    authenticationPresentation({ status: 'signing-in' }).message,
    /in progress/,
  );
});
