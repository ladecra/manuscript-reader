import { useEffect, useRef, useState, useCallback } from 'react';

interface ToastState {
  message: string;
  visible: boolean;
}

let showToastExternal: ((msg: string, duration?: number) => void) | null = null;

// eslint-disable-next-line react-refresh/only-export-components -- toast singleton lives with its component
export function useToast() {
  const [state, setState] = useState<ToastState>({ message: '', visible: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, duration = 2800) => {
    if (timer.current) clearTimeout(timer.current);
    setState({ message: msg, visible: true });
    timer.current = setTimeout(() => setState(s => ({ ...s, visible: false })), duration);
  }, []);

  useEffect(() => {
    showToastExternal = showToast;
    return () => { showToastExternal = null; };
  }, [showToast]);

  return { toastState: state, showToast };
}

/** Call from anywhere (outside React tree) — e.g. in engine utilities. */
// eslint-disable-next-line react-refresh/only-export-components -- imperative toast trigger
export function showToast(msg: string, duration?: number): void {
  showToastExternal?.(msg, duration);
}

interface ToastProps {
  message: string;
  visible: boolean;
}

export function Toast({ message, visible }: ToastProps) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(28px + var(--safe-bottom))',
        left: '50%',
        transform: `translateX(-50%) translateY(${visible ? '0' : '12px'})`,
        background: 'var(--surface-high)',
        border: '1px solid var(--border)',
        color: 'var(--on-surface)',
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
        fontSize: '12px',
        letterSpacing: '0.04em',
        padding: '9px 18px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.25s, transform 0.25s',
        pointerEvents: 'none',
        zIndex: 300,
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
}
