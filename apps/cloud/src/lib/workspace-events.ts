export const WORKSPACE_NAVIGATION_CHANGED = "runory:workspace-navigation-changed";

export function notifyWorkspaceNavigationChanged(): void {
  window.dispatchEvent(new Event(WORKSPACE_NAVIGATION_CHANGED));
}
