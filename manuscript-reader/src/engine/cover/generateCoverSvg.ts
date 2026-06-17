// ─── Generated manuscript cover (deterministic SVG) ─────────────────────────
// Same inputs → same cover. Used by the hub hero (and later library cards / EPUB).

export interface CoverInput {
  title: string;
  author?: string;
  series?: string;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Simple line-art motifs — title hash picks variant and stroke density. */
function motifPaths(seed: number): string {
  const v = seed % 4;
  const stroke = 'stroke="#c9a06a" stroke-width="1.2" fill="none" stroke-linecap="round"';
  switch (v) {
    case 0:
      return `<path ${stroke} d="M60 175 Q60 95 60 55 M60 55 Q45 75 38 95 M60 55 Q75 75 82 95 M60 120 Q40 130 35 145 M60 120 Q80 130 85 145"/>`;
    case 1:
      return `<path ${stroke} d="M45 160 L60 50 L75 160 M50 125 L70 125"/><circle cx="60" cy="42" r="6" ${stroke}/>`;
    case 2:
      return `<path ${stroke} d="M35 150 C35 80 60 45 60 45 C60 45 85 80 85 150 M60 70 L60 130"/>`;
    default:
      return `<path ${stroke} d="M30 155 Q60 40 90 155 M48 120 Q60 100 72 120"/>`;
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Build an SVG cover document (120×180 viewBox, 2:3). */
export function generateCoverSvg(input: CoverInput): string {
  const title = input.title.trim() || 'Untitled';
  const author = input.author?.trim() ?? '';
  const seed = hashString(`${title}|${author}|${input.series ?? ''}`);
  const titleLines = title.length > 28 ? [title.slice(0, 28), title.slice(28, 56)] : [title];
  const titleY = titleLines.length > 1 ? 118 : 128;
  const titleSvg = titleLines
    .map((line, i) => `<tspan x="60" dy="${i === 0 ? 0 : 14}">${escapeXml(line)}</tspan>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 180" width="120" height="180">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#14141c"/>
      <stop offset="100%" stop-color="#0a0a0f"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="55%">
      <stop offset="0%" stop-color="rgba(231,168,90,0.12)"/>
      <stop offset="100%" stop-color="rgba(231,168,90,0)"/>
    </radialGradient>
  </defs>
  <rect width="120" height="180" fill="url(#bg)"/>
  <rect width="120" height="180" fill="url(#glow)"/>
  ${motifPaths(seed)}
  <text x="60" y="${titleY}" text-anchor="middle" fill="#edebf4" font-family="'Cormorant Garamond', Georgia, serif" font-size="12" font-weight="600">${titleSvg}</text>
  ${author ? `<text x="60" y="158" text-anchor="middle" fill="#9c9aa8" font-family="'Schibsted Grotesk', system-ui, sans-serif" font-size="6.5" letter-spacing="0.14em">${escapeXml(author.toUpperCase())}</text>` : ''}
</svg>`;
}

/** Data URL suitable for &lt;img src&gt; in the hub. */
export function coverSvgDataUrl(input: CoverInput): string {
  const svg = generateCoverSvg(input);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
