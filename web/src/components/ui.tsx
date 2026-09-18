import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { IconEye, IconEyeOff } from './icons';

/** Password field with a show/hide (eye) toggle. */
export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
  autoComplete = 'current-password',
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        id={id}
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {show ? <IconEyeOff width={18} height={18} /> : <IconEye width={18} height={18} />}
      </button>
    </div>
  );
}

export function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ── Theme (light/dark) ─────────────────────────────────────────────────────
// Persisted on <html data-theme>; falls back to the OS preference on first run.
export function applyStoredTheme(): void {
  try {
    const t = localStorage.getItem('cap.theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch {
    /* storage blocked — leave OS preference in charge */
  }
}

export function useTheme(): { theme: 'light' | 'dark'; toggle: () => void } {
  const read = (): 'light' | 'dark' => {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  const [theme, setTheme] = useState<'light' | 'dark'>(read);
  const toggle = () => {
    const root = document.documentElement;
    const next = read() === 'dark' ? 'light' : 'dark';
    // Suppress CSS transitions for the swap so the whole UI recolors in one
    // frame (instant), then restore transitions on the next frame.
    root.classList.add('theme-instant');
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('cap.theme', next);
    } catch {
      /* ignore */
    }
    setTheme(next);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-instant')));
  };
  return { theme, toggle };
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

export function ThemeToggle({ className = 'iconbtn' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      className={className}
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function Pill({ status, children }: { status: string; children?: ReactNode }) {
  return <span className={`pill pill--${status}`}>{children ?? status}</span>;
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function LoadingScreen() {
  return (
    <div className="center-screen">
      <Spinner />
    </div>
  );
}

// Neutral line-art placeholder — no emoji. A string `icon` (legacy callers) is
// ignored in favour of this; pass a ReactNode to override deliberately.
function EmptyGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8l2-4h14l2 4" />
      <path d="M3 8h6l1.5 3h3L15 8h6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  const glyph = icon && typeof icon !== 'string' ? icon : <EmptyGlyph />;
  return (
    <div className="empty">
      <div className="empty__icon">{glyph}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

// Skeleton primitives (tell #21: show skeletons, not a bare spinner).
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

// Tiny trend spark for KPI tiles — bars grow in on mount.
export function Spark({ bars }: { bars: number[] }) {
  return (
    <div className="spark" aria-hidden>
      {bars.map((h, i) => (
        <i key={i} style={{ height: `${h}%`, animationDelay: `${0.3 + i * 0.05}s` }} />
      ))}
    </div>
  );
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="sk-line" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </>
  );
}

/** Count-up animation for dashboard numbers (respects reduced-motion). */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>();

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return <>{display.toLocaleString()}</>;
}

/** Minimal data-fetch hook: {data, loading, error, reload}. */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fn()
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e.message ?? 'Failed to load'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}
