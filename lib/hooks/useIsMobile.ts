import { useEffect, useState } from 'react';

// True below Tailwind's `sm` breakpoint (640px) — the same threshold the cards use to switch to
// the mobile layout. Lets recharts (which has no CSS-breakpoint props) tighten chart axes on mobile
// only, leaving desktop untouched. SSR-safe: starts false (desktop), corrects on mount.
export function useIsMobile(): boolean {
  // Lazy initializer reads the viewport on the first client render (no desktop→mobile flash).
  // SSR has no `window`, so it starts false there; the chart is client-rendered only, so this
  // doesn't drive any server-rendered markup (no hydration mismatch).
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 639px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}
