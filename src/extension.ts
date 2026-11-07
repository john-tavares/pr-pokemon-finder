import * as vscode from 'vscode';
import {
  AuthenticationController,
  type AuthenticationState,
} from './auth/authentication';
import {
  authenticationPresentation,
  SIGN_IN_COMMAND,
  STATUS_COMMAND,
} from './auth/status';
import { VSCodeSessionProvider } from './auth/vscode-session-provider';
import { GitHubClient } from './github/client';
import { registerGitHubCommands } from './github/commands';
import { registerDiscoveryCommands } from './github/discovery-commands';

export interface ExtensionApi {
  getAuthenticationState(): AuthenticationState;
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<ExtensionApi> {
  const provider = new VSCodeSessionProvider();
  const authentication = new AuthenticationController(provider);
  const github = new GitHubClient(provider);
  registerGitHubCommands(context, github, authentication);
  registerDiscoveryCommands(context, github, authentication, provider);
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10,
  );
  statusBar.name = 'PR Pokémon Finder authentication';
  const render = (state: AuthenticationState) => {
    const presentation = authenticationPresentation(state);
    statusBar.text = presentation.text;
    statusBar.tooltip = presentation.tooltip;
    statusBar.command = presentation.command;
    statusBar.accessibilityInformation = { label: presentation.tooltip };
    statusBar.show();
  };

  context.subscriptions.push(
    authentication,
    statusBar,
    authentication.onDidChangeState(render),
    vscode.commands.registerCommand(SIGN_IN_COMMAND, async () => {
      await authentication.signIn();
      if (authentication.state.status === 'disconnected') {
        void vscode.window.showInformationMessage(
          'GitHub sign-in was not completed. You can retry using PR Pokémon Finder: Sign in to GitHub.',
        );
      }
    }),
    vscode.commands.registerCommand(STATUS_COMMAND, async () => {
      const state = authentication.state;
      const message = authenticationPresentation(state).message;
      if (state.status === 'connected' || state.status === 'signing-in') {
        await vscode.window.showInformationMessage(message);
      } else if (
        (await vscode.window.showInformationMessage(message, 'Sign in')) ===
        'Sign in'
      ) {
        await vscode.commands.executeCommand(SIGN_IN_COMMAND);
      }
    }),
  );

  render(authentication.state);
  await authentication.restore();
  return { getAuthenticationState: () => ({ ...authentication.state }) };
}
