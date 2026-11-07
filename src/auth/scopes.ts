export const PUBLIC_GITHUB_SCOPES: readonly string[] = ['read:user'];
export const PRIVATE_GITHUB_SCOPES: readonly string[] = ['read:user', 'repo'];

export function githubScopes(includePrivate: boolean): readonly string[] {
  return includePrivate ? PRIVATE_GITHUB_SCOPES : PUBLIC_GITHUB_SCOPES;
}
