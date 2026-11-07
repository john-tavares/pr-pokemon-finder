import type { Disposable } from '../auth/authentication';
import { GitHubApiError } from '../github/client';
import type { DiscoveryResult } from '../github/discovery';
import {
  decodeIndex,
  reconcilePolling,
  type PendingEncounter,
  type PollingIndex,
} from './index';

export interface PollingStore {
  read(accountId: number): unknown;
  write(accountId: number, index: PollingIndex): Promise<void>;
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
  };
  private pending: readonly PendingEncounter[] = [];
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
    this.update({
      phase: options.active ? 'polling' : 'paused',
      knownCount: 0,
      pendingCount: 0,
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
          const previous = decodeIndex(this.store.read(result.account.id));
          const { index } = reconcilePolling(
            previous,
            result,
            options.includePrivate,
            startedAt,
          );
          await this.store.write(result.account.id, index);
          if (!current()) return;
          this.pending = index.pending.filter(
            (item) => options.includePrivate || item.accessMode === 'public',
          );
          this.update({
            phase: result.complete ? 'idle' : 'partial',
            knownCount: index.known.length + index.legacyKnownIds.length,
            pendingCount: this.pending.length,
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
    this.listeners.clear();
  }
}
