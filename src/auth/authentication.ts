export interface Disposable {
  dispose(): void;
}

/** Deliberately excludes the token: US-01 only needs public account information. */
export interface AccountSession {
  readonly account: { readonly id: string; readonly label: string };
}

export type SessionRequest = { silent: true } | { createIfNone: true };

export interface SessionProvider {
  getSession(options: SessionRequest): Promise<AccountSession | undefined>;
  onDidChangeSessions(listener: (providerId: string) => void): Disposable;
}

export type AuthenticationState =
  | { readonly status: 'disconnected' }
  | { readonly status: 'signing-in' }
  | { readonly status: 'connected'; readonly accountLabel: string }
  | { readonly status: 'unavailable' };

export class AuthenticationController implements Disposable {
  private current: AuthenticationState = { status: 'disconnected' };
  private readonly listeners = new Set<(state: AuthenticationState) => void>();
  private readonly subscription: Disposable;
  private revision = 0;
  private disposed = false;
  private signInRequest: Promise<void> | undefined;
  private refreshAfterSignIn = false;

  constructor(private readonly provider: SessionProvider) {
    this.subscription = provider.onDidChangeSessions((providerId) => {
      if (providerId !== 'github' || this.disposed) return;
      if (this.signInRequest) {
        this.refreshAfterSignIn = true;
      } else {
        void this.restore();
      }
    });
  }

  get state(): AuthenticationState {
    return this.current;
  }

  onDidChangeState(listener: (state: AuthenticationState) => void): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  /** Silent lookup reuses VS Code's session without prompting or persisting secrets. */
  async restore(): Promise<void> {
    if (this.disposed) return;
    const revision = ++this.revision;
    try {
      const session = await this.provider.getSession({ silent: true });
      this.applySession(session, revision);
    } catch {
      this.apply({ status: 'unavailable' }, revision);
    }
  }

  signIn(): Promise<void> {
    if (this.disposed || this.current.status === 'connected')
      return Promise.resolve();
    if (this.signInRequest) return this.signInRequest;

    const revision = ++this.revision;
    this.apply({ status: 'signing-in' }, revision);
    // Defer provider invocation until the single-flight guard has been assigned.
    this.signInRequest = Promise.resolve().then(async () => {
      try {
        const session = await this.provider.getSession({ createIfNone: true });
        this.applySession(session, revision);
      } catch {
        // Cancellation, consent denial and provider failures are safe to retry.
        // Never surface provider errors: they may contain sensitive information.
        this.apply({ status: 'disconnected' }, revision);
      } finally {
        this.signInRequest = undefined;
        if (this.refreshAfterSignIn && !this.disposed) {
          this.refreshAfterSignIn = false;
          await this.restore();
        }
      }
    });
    return this.signInRequest;
  }

  private applySession(
    session: AccountSession | undefined,
    revision: number,
  ): void {
    this.apply(
      session
        ? { status: 'connected', accountLabel: session.account.label }
        : { status: 'disconnected' },
      revision,
    );
  }

  private apply(state: AuthenticationState, revision: number): void {
    if (this.disposed || revision !== this.revision) return;
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }

  dispose(): void {
    this.disposed = true;
    ++this.revision;
    this.subscription.dispose();
    this.listeners.clear();
    this.current = { status: 'disconnected' };
  }
}
