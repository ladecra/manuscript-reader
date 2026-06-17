/** Match index.css `@media (max-width: 860px)` mobile workspace layout. */
export const WORKSPACE_RAIL_MOBILE_MAX_PX = 860;

export function isMobileWorkspaceViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= WORKSPACE_RAIL_MOBILE_MAX_PX;
}

export function workspaceRailOpenByDefault(screen: 'manuscript' | 'reader'): boolean {
  if (screen === 'reader') return false;
  return !isMobileWorkspaceViewport();
}
