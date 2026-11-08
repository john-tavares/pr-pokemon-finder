import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decodeIndex, type PollingIndex } from './index';
import type { PollingStore } from './controller';

/** Exclusive local writer; a busy or ambiguous orphan lock fails closed. */
export class FilePollingStore implements PollingStore {
  constructor(
    private readonly directory: string,
    private readonly readLegacy: (accountId: number) => unknown,
  ) {}

  /** A read never rewrites/migrates the durable ledger or acknowledges a scene. */
  async readSnapshot(accountId: number): Promise<PollingIndex> {
    if (!Number.isSafeInteger(accountId) || accountId <= 0)
      throw new Error('Invalid account identity.');
    let value: unknown;
    try {
      value = JSON.parse(
        await readFile(
          join(this.directory, `account-${accountId}.json`),
          'utf8',
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      value = this.readLegacy(accountId);
    }
    // Writers replace the whole file atomically: a reader sees either committed
    // snapshot. It must not contend with capture acknowledgement for a write lock.
    return structuredClone(decodeIndex(value));
  }

  async update(
    accountId: number,
    transform: (value: unknown) => PollingIndex | undefined,
  ): Promise<PollingIndex | undefined> {
    if (!Number.isSafeInteger(accountId) || accountId <= 0)
      throw new Error('Invalid account identity.');
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `account-${accountId}.json`);
    const lockPath = `${path}.lock`;
    const lock = await open(lockPath, 'wx', 0o600);
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await lock.writeFile(
        JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString(),
        }),
      );
      let value: unknown;
      try {
        value = JSON.parse(await readFile(path, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        value = this.readLegacy(accountId);
      }
      const next = transform(value);
      if (next === undefined) return undefined;
      decodeIndex(next);
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(next));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, path);
      return structuredClone(next);
    } finally {
      try {
        await unlink(temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      } finally {
        await lock.close();
        await unlink(lockPath);
      }
    }
  }
}
