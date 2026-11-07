import type { AuthenticationState } from './authentication';

export const SIGN_IN_COMMAND = 'prPokemonFinder.signIn';
export const STATUS_COMMAND = 'prPokemonFinder.showAuthenticationStatus';

export function authenticationPresentation(state: AuthenticationState) {
  switch (state.status) {
    case 'connected':
      return {
        text: '$(github) PR Pokémon: Connected',
        tooltip: `Signed in to GitHub as ${state.accountLabel}. Click to view authentication status.`,
        message: `PR Pokémon Finder is connected to GitHub as ${state.accountLabel}. Manage access in the VS Code Accounts menu.`,
        command: STATUS_COMMAND,
      };
    case 'signing-in':
      return {
        text: '$(loading~spin) PR Pokémon: Signing in',
        tooltip: 'Complete GitHub authentication in the VS Code sign-in flow.',
        message:
          'GitHub sign-in is in progress. Complete the VS Code authentication flow.',
        command: STATUS_COMMAND,
      };
    case 'unavailable':
      return {
        text: '$(warning) PR Pokémon: GitHub unavailable',
        tooltip:
          'GitHub authentication is unavailable. Click to retry sign-in.',
        message:
          'GitHub authentication is unavailable. Enable the built-in GitHub Authentication extension and try signing in again.',
        command: SIGN_IN_COMMAND,
      };
    case 'disconnected':
      return {
        text: '$(github) PR Pokémon: Sign in',
        tooltip: 'Not connected to GitHub. Click to sign in.',
        message:
          'PR Pokémon Finder is not connected to GitHub. Sign in to connect your account.',
        command: SIGN_IN_COMMAND,
      };
  }
}
