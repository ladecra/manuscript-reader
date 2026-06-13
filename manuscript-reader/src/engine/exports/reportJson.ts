import type { Report } from '../types';

export function exportReportJson(title: string, id: string, report: Report): void {
  const { generatedAt: _g, ...rest } = report;
  const payload = { manuscript: title, generatedAt: new Date().toISOString(), ...rest };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${id}-report.json`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}
