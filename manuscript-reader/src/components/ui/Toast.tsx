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
        transform: `translateX(-50%) translateY(${visible ? '0' : '8px'})`,
        background: 'rgba(20, 20, 20, 0.9)',
        backdropFilter: 'blur(12px) saturate(120%)',
        WebkitBackdropFilter: 'blur(12px) saturate(120%)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        borderRadius: '0',
        color: 'rgba(255, 255, 255, 0.7)',
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
        fontSize: '10px',
        fontWeight: 500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        padding: '9px 18px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s, transform 0.2s',
        pointerEvents: 'none',
        zIndex: 300,
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
}
