import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const titlePattern =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9][a-z0-9/-]*\))?!?: \S[^\r\n]*$/;

export function validateTitle(title) {
  if (typeof title !== 'string' || title !== title.trim()) {
    return false;
  }

  return title.length <= 72 && titlePattern.test(title);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const title =
      process.argv[2] ??
      JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
        .pull_request?.title;

    if (!validateTitle(title)) {
      throw new Error(
        'Use a Conventional Commit title of at most 72 characters, e.g. docs: explain setup. See CONTRIBUTING.md.',
      );
    }

    console.log('PR title is valid.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
