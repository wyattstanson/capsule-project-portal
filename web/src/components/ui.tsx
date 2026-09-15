import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(' ');
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
