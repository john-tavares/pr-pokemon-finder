import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Inspect the actual package, not the source tree used to build it. */
export function verifyVsix(bytes) {
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65557);
    offset--
  ) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw Error('Missing ZIP directory.');
  const count = bytes.readUInt16LE(end + 10);
  if (!count || count > 1000) throw Error('Invalid ZIP entry count.');
  let cursor = bytes.readUInt32LE(end + 16);
  const files = new Map();
  for (let index = 0; index < count; index++) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw Error('Invalid ZIP directory.');
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameSize = bytes.readUInt16LE(cursor + 28);
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameSize)
      .toString('utf8');
    if (
      size > 4 * 1024 * 1024 ||
      files.has(name) ||
      name.includes('..') ||
      name.includes('\\')
    )
      throw Error('Unsafe or duplicate package entry.');
    const local = bytes.readUInt32LE(cursor + 42);
    if (bytes.readUInt32LE(local) !== 0x04034b50)
      throw Error('Invalid local ZIP entry.');
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + compressedSize);
    const content =
      method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed, { maxOutputLength: 4 * 1024 * 1024 })
          : undefined;
    if (!content || content.length !== size)
      throw Error('Invalid package content.');
    files.set(name, content);
    cursor +=
      46 +
      nameSize +
      bytes.readUInt16LE(cursor + 30) +
      bytes.readUInt16LE(cursor + 32);
  }
  for (const required of [
    'extension/package.json',
    'extension/readme.md',
    'extension/LICENSE.txt',
    'extension/THIRD_PARTY_NOTICES.md',
    'extension/media/OFL-VT323.txt',
    'extension/media/VT323-Regular.ttf',
    'extension/media/capture.js',
    'extension/media/capture.css',
    'extension/out/src/extension.js',
    'extension.vsixmanifest',
    '[Content_Types].xml',
  ])
    if (!files.has(required))
      throw Error(`Missing runtime resource: ${required}`);
  for (const name of files.keys()) {
    if (/node_modules|\/test\/|\.map$|\.ts$|\.env|\.git\//.test(name))
      throw Error(`Development/private file included: ${name}`);
  }
  const manifest = JSON.parse(files.get('extension/package.json').toString());
  if (
    manifest.publisher !== 'john-tavares' ||
    manifest.name !== 'pr-pokemon-finder' ||
    !files.has('extension/' + manifest.main.replace(/^\.\//, ''))
  )
    throw Error('Invalid extension entry point.');
  return {
    files: files.size,
    version: manifest.version,
    engine: manifest.engines.vscode,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = verifyVsix(
    readFileSync(process.argv[2] ?? 'dist/pr-pokemon-finder.vsix'),
  );
  console.log(
    `VSIX verified: ${result.files} files, version ${result.version}, VS Code ${result.engine}.`,
  );
}
