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

export function PencilIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M11.5 3.2l3.3 3.3"/>
      <path d="M12.6 2.1a1.6 1.6 0 0 1 2.3 0l-.0 0a1.6 1.6 0 0 1 0 2.3L5.4 13.9l-3.4.9.9-3.4z"/>
    </svg>
  );
}

export function UndoIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M5 8H11.5a3.5 3.5 0 0 1 0 7H7"/>
      <path d="M7.5 5L4.5 8l3 3"/>
    </svg>
  );
}

export function RedoIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M13 8H6.5a3.5 3.5 0 0 0 0 7H11"/>
      <path d="M10.5 5l3 3-3 3"/>
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

export function StarIcon({ size = 14, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="1.5" strokeLinejoin="round" width={size} height={size}>
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.9 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/>
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

export function GearIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <circle cx="9" cy="9" r="2.4"/>
      <path d="M9 1.6v2.1M9 14.3v2.1M16.4 9h-2.1M3.7 9H1.6M14.2 3.8l-1.5 1.5M5.3 12.7l-1.5 1.5M14.2 14.2l-1.5-1.5M5.3 5.3 3.8 3.8"/>
    </svg>
  );
}

export function BookIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <path d="M9 4v11"/>
      <rect x="3" y="4" width="6" height="11"/>
      <rect x="9" y="4" width="6" height="11"/>
      <line x1="4.5" y1="7" x2="7.5" y2="7"/>
      <line x1="4.5" y1="9.5" x2="7.5" y2="9.5"/>
    </svg>
  );
}

export function ExportTrayIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <line x1="9" y1="3" x2="9" y2="12"/>
      <polyline points="6,6 9,3 12,6"/>
      <path d="M3 12v3h12v-3"/>
    </svg>
  );
}

export function LayersIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="square" width={size} height={size}>
      <polyline points="2,7 9,3 16,7 9,11 2,7"/>
      <polyline points="2,11 9,15 16,11"/>
    </svg>
  );
}

export function PanelIcon({ size = 17 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <rect x="2.5" y="3" width="13" height="12" rx="1"/>
      <line x1="11.5" y1="3" x2="11.5" y2="15"/>
    </svg>
  );
}

export function ChevronRightIcon({ size = 10, className }: IconProps) {
  return (
    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="square" width={size} height={size} className={className}>
      <polyline points="3.5,2 6.5,5 3.5,8"/>
    </svg>
  );
}

export function ChevronLeftIcon({ size = 10, className }: IconProps) {
  return (
    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="square" width={size} height={size} className={className}>
      <polyline points="6.5,2 3.5,5 6.5,8"/>
    </svg>
  );
}

export function CheckIcon({ size = 12, className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size} className={className}>
      <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

export function ClockIcon({ size = 15 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="round" width={size} height={size}>
      <circle cx="9" cy="9" r="6.5"/>
      <line x1="9" y1="5" x2="9" y2="9"/>
      <line x1="9" y1="9" x2="12" y2="11"/>
    </svg>
  );
}

export function HelpIcon({ size = 15 }: IconProps) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <circle cx="9" cy="9" r="6.5"/>
      <path d="M7 7.2a2.1 2.1 0 0 1 4 .7c0 1.4-2 2-2 2"/>
      <circle cx="9" cy="13" r=".4" fill="currentColor" stroke="none"/>
    </svg>
  );
}

export function ChevronDownIcon({ size = 10, className }: IconProps) {
  return (
    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size} className={className}>
      <polyline points="2,3.5 5,6.5 8,3.5"/>
    </svg>
  );
}
