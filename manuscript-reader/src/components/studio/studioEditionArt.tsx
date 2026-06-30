// ─── Studio edition illustrations ────────────────────────────────────────────
// Line-art representations of *the thing being made* — a physical book, an
// e-reader, a manuscript page — drawn in the app's restrained icon language
// (thin stroke, round joins, no fill, currentColor so they inherit the card's
// ink/muted state). These are illustrations, not glyphs: larger, quieter, and
// meant to read as objects on a shelf rather than UI controls.

interface ArtProps {
  size?: number;
  className?: string;
}

const baseProps = (size: number, className?: string) => ({
  viewBox: '0 0 72 72',
  width: size,
  height: size,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': true,
});

/** Print edition — a hardcover book, three-quarter view: cover, spine, page edges. */
export function PrintEditionArt({ size = 60, className }: ArtProps) {
  return (
    <svg {...baseProps(size, className)}>
      {/* page block behind the cover (the leaves) */}
      <path d="M27 17.5 51 14v40l-24 3.5z" opacity="0.5" />
      {/* front cover */}
      <path d="M21 16 27 17.5v40L21 56z" />
      <path d="M21 16 45 12.5 51 14 27 17.5z" />
      <path d="M27 17.5 51 14v40l-24 3.5z" />
      {/* spine hinge */}
      <path d="M30 18.6v38.4" opacity="0.55" />
      {/* title lines on the cover */}
      <path d="M35 27.5 46 26" opacity="0.7" />
      <path d="M35 32 43 30.9" opacity="0.7" />
    </svg>
  );
}

/** Ebook edition — an e-reader: device body, inset screen, text lines, home mark. */
export function EbookEditionArt({ size = 60, className }: ArtProps) {
  return (
    <svg {...baseProps(size, className)}>
      {/* device body */}
      <rect x="22" y="10" width="28" height="52" rx="4.5" />
      {/* screen */}
      <rect x="26" y="15" width="20" height="36" rx="1.5" opacity="0.7" />
      {/* lines of text on the screen */}
      <path d="M29.5 21h13" opacity="0.6" />
      <path d="M29.5 26h13" opacity="0.6" />
      <path d="M29.5 31h13" opacity="0.6" />
      <path d="M29.5 36h9" opacity="0.6" />
      {/* home indicator */}
      <path d="M33 56.5h6" opacity="0.55" />
    </svg>
  );
}

/** Agent submission — a manuscript page: sheet with a dog-eared corner and
 *  double-spaced lines (standard manuscript format). */
export function AgentSubmissionArt({ size = 60, className }: ArtProps) {
  return (
    <svg {...baseProps(size, className)}>
      {/* sheet with a folded top-right corner */}
      <path d="M22 11h21l7 7v43H22z" />
      <path d="M43 11v7h7" opacity="0.6" />
      {/* manuscript lines, double-spaced */}
      <path d="M27 26h18" opacity="0.6" />
      <path d="M27 32h18" opacity="0.6" />
      <path d="M27 38h18" opacity="0.6" />
      <path d="M27 44h18" opacity="0.6" />
      <path d="M27 50h11" opacity="0.6" />
    </svg>
  );
}
