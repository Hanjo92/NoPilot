import * as vscode from 'vscode';

interface NoPilotMenuAction {
  label: string;
  description: string;
  command: string;
  icon: vscode.ThemeIcon;
}

const MENU_ACTIONS: NoPilotMenuAction[] = [
  {
    label: 'Open Chat Panel',
    description: 'Open the persistent NoPilot chat panel in the Activity Bar',
    command: 'nopilot.openChatPanel',
    icon: new vscode.ThemeIcon('comment-discussion'),
  },
  {
    label: 'Open Settings',
    description: 'Open the NoPilot settings dashboard',
    command: 'nopilot.openSettings',
    icon: new vscode.ThemeIcon('gear'),
  },
  {
    label: 'Select Provider / Model',
    description: 'Choose a provider first, then select one of its models',
    command: 'nopilot.switchProvider',
    icon: new vscode.ThemeIcon('list-selection'),
  },
  {
    label: 'Set API Key',
    description: 'Save or change provider credentials in VS Code SecretStorage',
    command: 'nopilot.setApiKey',
    icon: new vscode.ThemeIcon('key'),
  },
  {
    label: 'Toggle Inline Suggestions',
    description: 'Enable or disable automatic NoPilot inline suggestions',
    command: 'nopilot.toggleInline',
    icon: new vscode.ThemeIcon('symbol-boolean'),
  },
  {
    label: 'Generate Commit Message',
    description: 'Create a commit message for the current Git changes',
    command: 'nopilot.generateCommitMessage',
    icon: new vscode.ThemeIcon('sparkle'),
  },
];

class NoPilotMenuItem extends vscode.TreeItem {
  constructor(action: NoPilotMenuAction) {
    super(action.label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = action.description;
    this.iconPath = action.icon;
    this.command = {
      command: action.command,
      title: action.label,
    };
  }
}

export class NoPilotMenuProvider implements vscode.TreeDataProvider<NoPilotMenuItem> {
  getTreeItem(element: NoPilotMenuItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: NoPilotMenuItem): NoPilotMenuItem[] {
    if (element) {
      return [];
    }

    return MENU_ACTIONS.map((action) => new NoPilotMenuItem(action));
  }
}
