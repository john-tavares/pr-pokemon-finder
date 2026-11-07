import { pokemonName } from './catalog';

const limit = 128 * 1024;
/** Runtime-only artwork: fixed public origin, never GitHub credentials or PR metadata. */
export class SpriteLoader {
  private readonly cache = new Map<number, Promise<string | undefined>>();
  constructor(private readonly request: typeof fetch = fetch) {}

  load(speciesId: number): Promise<string | undefined> {
    pokemonName(speciesId);
    const cached = this.cache.get(speciesId);
    if (cached) return cached;
    const loading = this.fetchSprite(speciesId).then((result) => {
      if (!result) this.cache.delete(speciesId);
      return result;
    });
    this.cache.set(speciesId, loading);
    return loading;
  }

  private async fetchSprite(id: number): Promise<string | undefined> {
    try {
      const response = await this.request(
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
        {
          method: 'GET',
          redirect: 'error',
          credentials: 'omit',
          signal: AbortSignal.timeout(5000),
        },
      );
      if (
        !response.ok ||
        !response.body ||
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .startsWith('image/png') ||
        Number(response.headers.get('content-length')) > limit
      ) {
        await response.body?.cancel();
        return undefined;
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > limit) {
            await reader.cancel();
            return undefined;
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      const png = Buffer.concat(chunks);
      if (
        png.length < 24 ||
        !png
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        png.toString('ascii', 12, 16) !== 'IHDR' ||
        png.readUInt32BE(16) < 1 ||
        png.readUInt32BE(16) > 256 ||
        png.readUInt32BE(20) < 1 ||
        png.readUInt32BE(20) > 256
      )
        return undefined;
      return `data:image/png;base64,${png.toString('base64')}`;
    } catch {
      return undefined;
    }
  }
}
