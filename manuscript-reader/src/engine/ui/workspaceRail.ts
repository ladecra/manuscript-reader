/** Match index.css `@media (max-width: 860px)` mobile workspace layout. */
export const WORKSPACE_RAIL_MOBILE_MAX_PX = 860;

/** Pure decision: given a screen name and whether the viewport is mobile, should the rail open? */
export function workspaceRailOpenByDefault(screen: 'manuscript' | 'reader', isMobile: boolean): boolean {
  if (screen === 'reader') return false;
  return !isMobile;
}
