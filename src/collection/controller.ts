import type { Disposable } from '../auth/authentication';
import type { Capture, PollingIndex } from '../polling/index';

export interface CollectionEntry {
  readonly capture: Capture;
  readonly presentation: 'pending' | 'shown';
}
export interface CollectionState {
  readonly phase: 'signed-out' | 'unverified' | 'loading' | 'ready' | 'error';
  readonly entries: readonly CollectionEntry[];
}

/** Account-global read model. Network/workspace state never owns the collection. */
export class CollectionController implements Disposable {
  private current: CollectionState = { phase: 'signed-out', entries: [] };
  private revision = 0;
  private identity = '';
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly read: (accountId: number) => Promise<PollingIndex>,
  ) {}

  get state(): CollectionState {
    return structuredClone(this.current);
  }

  onDidChange(listener: () => void): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  async refresh(
    signedIn: boolean,
    accountId: number | undefined,
    includePrivate: boolean,
  ): Promise<void> {
    if (this.disposed) return;
    const revision = ++this.revision;
    const identity = `${signedIn}:${accountId}:${includePrivate}`;
    const entries = identity === this.identity ? this.current.entries : [];
    this.identity = identity;
    if (!signedIn || accountId === undefined) {
      this.publish({
        phase: signedIn ? 'unverified' : 'signed-out',
        entries: [],
      });
      return;
    }
    this.publish({ phase: 'loading', entries });
    try {
      const index = await this.read(accountId);
      if (this.disposed || revision !== this.revision) return;
      const presentations = new Map(
        index.presentations.map((item) => [item.key, item.status]),
      );
      this.publish({
        phase: 'ready',
        entries: index.captures
          .filter(
            (item) => includePrivate || item.source.accessMode === 'public',
          )
          .map((capture) => ({
            capture: structuredClone(capture),
            presentation: presentations.get(capture.key) ?? 'pending',
          })),
      });
    } catch {
      if (!this.disposed && revision === this.revision)
        this.publish({ phase: 'error', entries });
    }
  }

  private publish(state: CollectionState): void {
    this.current = state;
    for (const listener of this.listeners) listener();
  }

  dispose(): void {
    this.disposed = true;
    this.revision++;
    this.current = { phase: 'signed-out', entries: [] };
    this.listeners.clear();
  }
}
