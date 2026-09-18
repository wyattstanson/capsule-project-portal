import { useEffect, useState } from 'react';

const SEEN_KEY = 'capsule.introSeen';

/**
 * Cinematic brand intro: the mark draws itself in over an aurora field, the
 * wordmark rises, then the whole splash lifts away to reveal the app.
 * - Skips instantly for prefers-reduced-motion, and after the first view in a
 *   session (so it isn't repeated on in-app reloads).
 * - Click anywhere to skip.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
      /* private mode — treat as unseen */
    }
    if (reduce || seen) {
      onDone();
      return;
    }
    const toLeave = window.setTimeout(() => setLeaving(true), 2600);
    const toDone = window.setTimeout(() => {
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* ignore */
      }
      onDone();
    }, 3500);
    return () => {
      clearTimeout(toLeave);
      clearTimeout(toDone);
    };
  }, [onDone]);

  const skip = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    onDone();
  };

  return (
    <div
      className={`intro-splash${leaving ? ' leaving' : ''}`}
      onClick={skip}
      role="img"
      aria-label="Capstone Portal"
    >
      <div className="intro-aurora" />
      <div className="intro-wrap">
        <svg className="intro-mark" viewBox="0 0 96 96" fill="none" aria-hidden>
          <defs>
            <linearGradient id="intro-mg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8fd0ff" />
              <stop offset="1" stopColor="#0f6cbd" />
            </linearGradient>
          </defs>
          <circle className="intro-halo" cx="48" cy="48" r="30" stroke="#2899f5" strokeWidth="1.5" />
          <path className="intro-ring" d="M70 30 A26 26 0 1 0 70 66" stroke="url(#intro-mg)" strokeWidth="8" strokeLinecap="round" />
          <circle className="intro-cee" cx="48" cy="48" r="6" fill="#fff" />
        </svg>
        <div className="intro-brand">
          Capstone <b>Portal</b>
        </div>
        <div className="intro-tag">7th-semester capstone · team formation &amp; approval</div>
        <div className="intro-rule" />
      </div>
    </div>
  );
}
