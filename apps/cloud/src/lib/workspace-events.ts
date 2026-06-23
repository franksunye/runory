export const WORKSPACE_NAVIGATION_CHANGED = "runory:workspace-navigation-changed";
export const WORKSPACE_DATA_CHANGED = "runory:workspace-data-changed";

export function notifyWorkspaceNavigationChanged(): void {
  window.dispatchEvent(new Event(WORKSPACE_NAVIGATION_CHANGED));
}

export function notifyWorkspaceDataChanged(): void {
  window.dispatchEvent(new Event(WORKSPACE_DATA_CHANGED));
}
