import type { Disposable } from '../auth/authentication';

/** Coalesce wakeups without dropping a manual request received during a scene. */
export class PresentationQueue implements Disposable {
  private running: Promise<void> | undefined;
  private requested = false;
  private manual = false;
  private disposed = false;

  constructor(private readonly drain: (manual: boolean) => Promise<void>) {}

  request(manual = false): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.requested = true;
    this.manual ||= manual;
    if (this.running) return this.running;
    this.running = Promise.resolve()
      .then(async () => {
        while (this.requested && !this.disposed) {
          this.requested = false;
          const requestedManually = this.manual;
          this.manual = false;
          await this.drain(requestedManually);
        }
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  dispose(): void {
    this.disposed = true;
    this.requested = false;
    this.manual = false;
  }
}
