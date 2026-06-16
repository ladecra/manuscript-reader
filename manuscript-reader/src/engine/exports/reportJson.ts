import type { EditorialSignals } from '../types';

// Exports the canonical EditorialSignals object (Phase 6.3): the annotation-derived
// `report` substrate plus the multi-reader findings (agreement, completion, versions
// read). This is the same structured data the panel, the document exports, and the
// future AI layer consume — so a downstream tool reading this JSON sees exactly what
// the engine sees, with no presentation baked in.
export function exportReportJson(title: string, id: string, signals: EditorialSignals): void {
  const { generatedAt: _g, ...rest } = signals;
  const payload = { manuscript: title, generatedAt: new Date().toISOString(), ...rest };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${id}-report.json`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
