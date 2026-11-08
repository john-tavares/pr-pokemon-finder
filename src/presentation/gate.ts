import { mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export interface PresentationGate {
  run(accountId: number, operation: () => Promise<boolean>): Promise<boolean>;
}

/** Independent from the short-lived snapshot writer lock; held until scene dismissal. */
export class FilePresentationGate implements PresentationGate {
  constructor(private readonly directory: string) {}
  async run(
    accountId: number,
    operation: () => Promise<boolean>,
  ): Promise<boolean> {
    if (!Number.isSafeInteger(accountId) || accountId <= 0)
      throw new Error('Invalid presentation account.');
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `account-${accountId}.presentation.lock`);
    let lock;
    try {
      lock = await open(path, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
    try {
      await lock.writeFile(
        JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString(),
        }),
      );
      return await operation();
    } finally {
      await lock.close();
      await unlink(path);
    }
  }
}
