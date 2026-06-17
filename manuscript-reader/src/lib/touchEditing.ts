/** Touch-primary devices where in-place contentEditable is unreliable (iOS Safari/Chrome, etc.). */
export function usesTouchFriendlyEditing(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0;
}
