// ─── Icon Components ──────────────────────────────────────────────────────────
// Inline SVG icons matching the original design exactly.

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function QuillIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="var(--brand)" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size} {...props}>
      <path d="M16.5 3.2C11 4 7.2 7.4 5.1 12.2c-.5 1.2-.9 2.6-1.1 4.1"/>
      <path d="M16.5 3.2c.6 3.4-.2 6.4-2 8.6-1.6 2-4 3-6.6 2.9"/>
      <path d="M4 16.8l2.4-2.4"/>
    </svg>
  );
}

export function MenuIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <line x1="2" y1="4" x2="16" y2="4"/>
      <line x1="2" y1="9" x2="16" y2="9"/>
      <line x1="2" y1="14" x2="16" y2="14"/>
    </svg>
  );
}

export function MoonIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      width={size} height={size}>
      <path d="M15 10.5A6 6 0 1 1 7.5 3a4.5 4.5 0 0 0 7.5 7.5z"/>
    </svg>
  );
}

export function SunIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      width={size} height={size}>
      <circle cx="9" cy="9" r="3.5"/>
      <line x1="9" y1="1" x2="9" y2="3"/>
      <line x1="9" y1="15" x2="9" y2="17"/>
      <line x1="1" y1="9" x2="3" y2="9"/>
      <line x1="15" y1="9" x2="17" y2="9"/>
      <line x1="3.2" y1="3.2" x2="4.6" y2="4.6"/>
      <line x1="13.4" y1="13.4" x2="14.8" y2="14.8"/>
      <line x1="14.8" y1="3.2" x2="13.4" y2="4.6"/>
      <line x1="4.6" y1="13.4" x2="3.2" y2="14.8"/>
    </svg>
  );
}

export function AnnotateIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <rect x="2" y="2" width="14" height="11"/>
      <line x1="5" y1="16" x2="13" y2="16"/>
      <line x1="5" y1="6" x2="13" y2="6"/>
      <line x1="5" y1="9" x2="10" y2="9"/>
    </svg>
  );
}

export function ReportIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <rect x="2" y="2" width="14" height="14"/>
      <line x1="5" y1="12" x2="5" y2="14"/>
      <line x1="9" y1="9" x2="9" y2="14"/>
      <line x1="13" y1="6" x2="13" y2="14"/>
    </svg>
  );
}

export function ShareIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <circle cx="14" cy="3" r="2"/>
      <circle cx="4" cy="9" r="2"/>
      <circle cx="14" cy="15" r="2"/>
      <line x1="5.9" y1="8" x2="12.1" y2="4.4"/>
      <line x1="5.9" y1="10" x2="12.1" y2="13.6"/>
    </svg>
  );
}

export function FontDownIcon({ size = 14 }: IconProps) {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <text x="1" y="11" fontFamily="serif" fontSize="10" fill="currentColor" stroke="none">A</text>
    </svg>
  );
}

export function XIcon({ size = 14 }: IconProps) {
  return (
    <svg viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <line x1="1" y1="1" x2="12" y2="12"/>
      <line x1="12" y1="1" x2="1" y2="12"/>
    </svg>
  );
}

export function PlusIcon({ size = 11 }: IconProps) {
  return (
    <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <line x1="5.5" y1="1" x2="5.5" y2="10"/>
      <line x1="1" y1="5.5" x2="10" y2="5.5"/>
    </svg>
  );
}

export function LibraryIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <rect x="2" y="2" width="4" height="14"/>
      <rect x="7" y="2" width="4" height="14"/>
      <rect x="12" y="2" width="4" height="14"/>
    </svg>
  );
}

export function DotsIcon({ size = 13 }: IconProps) {
  return (
    <svg viewBox="0 0 13 13" fill="currentColor" width={size} height={size}>
      <circle cx="2" cy="6.5" r="1.2"/>
      <circle cx="6.5" cy="6.5" r="1.2"/>
      <circle cx="11" cy="6.5" r="1.2"/>
    </svg>
  );
}
