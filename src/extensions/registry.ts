import type { ReactNode } from "react";

export type ActionLocation = 
  | "command-palette" 
  | "context-menu:page" 
  | "context-menu:sidebar" 
  | "context-menu:editor" 
  | "sidebar-tools" 
  | "shortcut";


export interface ActionContext {
  // We'll define specific fields as needed. 
  // For now, let's keep it flexible or use a generic type.
  [key: string]: any;
}

export interface AppAction {
  id: string;
  label: string | ((context: ActionContext) => string);
  description?: string;

  shortcut?: string; // e.g. "Ctrl+Shift+N"
  icon?: ReactNode;
  tags?: string[];
  prefixes?: ("/" | "@")[];
  locations: ActionLocation[];
  onExecute: (context: ActionContext) => void;
  isVisible?: (context: ActionContext) => boolean;
  isDisabled?: (context: ActionContext) => boolean;
  order?: number;
}

class ActionRegistry {
  private actions: Map<string, AppAction> = new Map();

  register(action: AppAction) {
    this.actions.set(action.id, action);
  }

  unregister(id: string) {
    this.actions.delete(id);
  }

  getActions(): AppAction[] {
    return Array.from(this.actions.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  getActionsByLocation(location: ActionLocation): AppAction[] {
    return this.getActions().filter(a => a.locations.includes(location));
  }

  getActionById(id: string): AppAction | undefined {
    return this.actions.get(id);
  }

  matchShortcut(event: KeyboardEvent | React.KeyboardEvent): AppAction | undefined {
    const actions = this.getActionsByLocation("shortcut");
    for (const action of actions) {
      if (!action.shortcut) continue;
      
      const parts = action.shortcut.toLowerCase().split("+");
      const ctrl = parts.includes("ctrl") || parts.includes("cmd");
      const shift = parts.includes("shift");
      const alt = parts.includes("alt");
      const key = parts[parts.length - 1];

      const matchCtrl = ctrl === (event.ctrlKey || event.metaKey);
      const matchShift = shift === event.shiftKey;
      const matchAlt = alt === event.altKey;
      // Handle special keys like "Delete", "Backspace", "/", "?"
      const eventKey = event.key.toLowerCase();
      const matchKey = eventKey === key;

      if (matchCtrl && matchShift && matchAlt && matchKey) {
        return action;
      }
    }
    return undefined;
  }
}


export const registry = new ActionRegistry();
