import type { Disposable } from '../auth/authentication';
import { GitHubApiError } from '../github/client';
import type { DiscoveryResult } from '../github/discovery';
import {
  decodeIndex,
  capturePending,
  markPresentationShown,
  reconcilePolling,
  type Capture,
  type PendingEncounter,
  type PollingIndex,
} from './index';

export interface PollingStore {
  update(
    accountId: number,
    transform: (value: unknown) => PollingIndex | undefined,
  ): Promise<PollingIndex | undefined>;
}
export interface PollingOptions {
  active: boolean;
  includePrivate: boolean;
  intervalSeconds: number;
}
export interface PollingStatus {
  readonly phase: 'paused' | 'polling' | 'idle' | 'partial' | 'error';
  readonly knownCount: number;
  readonly pendingCount: number;
  readonly captureCount: number;
  readonly lastCheckedAt?: string;
  readonly error?: string;
}
type Discover = (options: {
  includePrivate: boolean;
  isCanceled: () => boolean;
}) => Promise<DiscoveryResult>;
type Schedule = (callback: () => void, milliseconds: number) => Disposable;
const schedule: Schedule = (callback, milliseconds) => {
  const timer = setTimeout(callback, milliseconds);
  return { dispose: () => clearTimeout(timer) };
};

export class PollingController implements Disposable {
  private options: PollingOptions = {
    active: false,
    includePrivate: false,
    intervalSeconds: 60,
  };
  private current: PollingStatus = {
    phase: 'paused',
    knownCount: 0,
    pendingCount: 0,
    captureCount: 0,
  };
  private pending: readonly PendingEncounter[] = [];
  private captures: readonly Capture[] = [];
  private accountId: number | undefined;
  private generation = 0;
  private timer: Disposable | undefined;
  private running: Promise<void> | undefined;
  private disposed = false;
  private readonly listeners = new Set<(status: PollingStatus) => void>();

  constructor(
    private readonly discover: Discover,
    private readonly store: PollingStore,
    private readonly authenticationRequired: () => void,
    private readonly scheduler: Schedule = schedule,
    private readonly now: () => number = Date.now,
  ) {}

  get status(): PollingStatus {
    return { ...this.current };
  }
  get pendingEncounters(): readonly PendingEncounter[] {
    return this.pending.map((item) => ({ ...item }));
  }

  get pendingCaptures(): readonly Capture[] {
    const keys = new Set(this.pending.map((item) => item.key));
    return structuredClone(this.captures.filter((item) => keys.has(item.key)));
  }

  /** Called by a future presenter only after it actually displays/dismisses the scene. */
  async confirmPresentation(key: string): Promise<void> {
    const accountId = this.accountId;
    const generation = this.generation;
    if (
      accountId === undefined ||
      !this.pending.some((item) => item.key === key)
    )
      return;
    const current = () =>
      !this.disposed && this.options.active && generation === this.generation;
    const index = await this.store.update(accountId, (value) =>
      current()
        ? markPresentationShown(
            decodeIndex(value),
            key,
            new Date(this.now()).toISOString(),
          )
        : undefined,
    );
    if (!index || !current()) return;
    this.loadCaptures(index, this.options.includePrivate);
    this.update({
      ...this.current,
      pendingCount: this.pending.length,
      captureCount: this.captures.length,
    });
  }

  private loadCaptures(index: PollingIndex, includePrivate: boolean): void {
    this.captures = index.captures.filter(
      (item) => includePrivate || item.source.accessMode === 'public',
    );
    const pending = new Set(
      index.presentations
        .filter((item) => item.status === 'pending')
        .map((item) => item.key),
    );
    this.pending = this.captures
      .filter((item) => pending.has(item.key))
      .map((item) => item.source);
  }
  onDidChangeStatus(listener: (status: PollingStatus) => void): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  configure(options: PollingOptions): void {
    if (this.disposed) return;
    this.generation++;
    this.timer?.dispose();
    this.timer = undefined;
    this.options = {
      ...options,
      intervalSeconds: Number.isFinite(options.intervalSeconds)
        ? Math.min(3600, Math.max(60, options.intervalSeconds))
        : 60,
    };
    this.pending = [];
    this.captures = [];
    this.accountId = undefined;
    this.update({
      phase: options.active ? 'polling' : 'paused',
      knownCount: 0,
      pendingCount: 0,
      captureCount: 0,
    });
    if (options.active) void this.pollNow();
  }

  pollNow(): Promise<void> {
    if (this.disposed || !this.options.active) return Promise.resolve();
    if (this.running) return this.running;
    this.timer?.dispose();
    this.timer = undefined;
    const generation = this.generation;
    const options = { ...this.options };
    const current = () =>
      !this.disposed && this.options.active && generation === this.generation;
    let delay = options.intervalSeconds * 1000;
    this.running = Promise.resolve()
      .then(async () => {
        if (!current()) return;
        this.update({ ...this.current, phase: 'polling', error: undefined });
        const startedAt = new Date(this.now()).toISOString();
        let storage = false;
        try {
          const result = await this.discover({
            includePrivate: options.includePrivate,
            isCanceled: () => !current(),
          });
          if (!current()) return;
          storage = true;
          const index = await this.store.update(result.account.id, (value) => {
            if (!current()) return undefined;
            const previous = decodeIndex(value);
            const { index } = reconcilePolling(
              previous,
              result,
              options.includePrivate,
              startedAt,
            );
            return capturePending(index, startedAt);
          });
          if (!index || !current()) return;
          this.accountId = result.account.id;
          this.loadCaptures(index, options.includePrivate);
          this.update({
            phase: result.complete ? 'idle' : 'partial',
            knownCount: index.known.length + index.legacyKnownIds.length,
            pendingCount: this.pending.length,
            captureCount: this.captures.length,
            lastCheckedAt: new Date(this.now()).toISOString(),
          });
        } catch (error) {
          if (!current()) return;
          const code = storage
            ? 'storage-error'
            : error instanceof GitHubApiError
              ? error.code
              : 'service-unavailable';
          this.update({ ...this.current, phase: 'error', error: code });
          if (
            error instanceof GitHubApiError &&
            error.code === 'rate-limited'
          ) {
            delay = Math.max(delay, (error.retryAfterSeconds ?? 60) * 1000);
          }
          if (
            code === 'authentication-expired' ||
            code === 'authentication-required'
          )
            this.authenticationRequired();
        }
      })
      .finally(() => {
        this.running = undefined;
        if (this.disposed || !this.options.active) return;
        if (generation !== this.generation) {
          void this.pollNow();
          return;
        }
        this.timer = this.scheduler(
          () => {
            this.timer = undefined;
            void this.pollNow();
          },
          Math.min(delay, 2_147_483_647),
        );
      });
    return this.running;
  }

  private update(status: PollingStatus): void {
    this.current = status;
    for (const listener of this.listeners) listener(this.status);
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.timer?.dispose();
    this.pending = [];
    this.captures = [];
    this.accountId = undefined;
    this.listeners.clear();
  }
}
