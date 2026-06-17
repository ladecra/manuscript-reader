/**
 * Touch-primary devices (phones, tablets). Reader edit mode uses paragraph-level
 * contentEditable and defers chapter commit until you leave the chapter or exit
 * edit — not on blur, which mobile browsers fire unreliably while the keyboard is open.
 */
export function usesTouchFriendlyEditing(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0;
}
