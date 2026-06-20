'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

// Section-level help: a (?) that opens a native top-layer popover. Top-layer escapes the card's
// overflow clipping (the bug with CSS tooltips) and works on touch. A top-layer popover would
// otherwise center in the viewport, so we position it next to the (?) with JS (cross-browser, unlike
// CSS anchor positioning which is Chromium-only). popover="auto" keeps Esc / tap-outside dismissal;
// the ✕ is an explicit close since the popup can cover the (?) on mobile.
export default function StatInfo({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pop = popRef.current;
    const btn = btnRef.current;
    if (!pop || !btn) return;

    // Place the popover just below the (?), clamped to the viewport, flipping above if it won't fit.
    const place = () => {
      const r = btn.getBoundingClientRect();
      const pr = pop.getBoundingClientRect();
      const gap = 6;
      const edge = 8;
      let left = r.left;
      if (pr.width && left + pr.width > window.innerWidth - edge) {
        left = window.innerWidth - pr.width - edge;
      }
      if (left < edge) left = edge;
      let top = r.bottom + gap;
      if (pr.height && top + pr.height > window.innerHeight - edge) {
        const above = r.top - pr.height - gap;
        top =
          above >= edge
            ? above
            : Math.max(edge, window.innerHeight - pr.height - edge);
      }
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(top)}px`;
    };

    // beforetoggle: rough placement before paint (popover still hidden, so no size yet) to avoid the
    // centered flash; toggle: refine once it has real dimensions.
    const onToggle = (e: Event) => {
      if ((e as Event & { newState?: string }).newState === 'open') place();
    };
    const onReposition = () => {
      if (pop.matches(':popover-open')) place();
    };

    pop.addEventListener('beforetoggle', onToggle);
    pop.addEventListener('toggle', onToggle);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      pop.removeEventListener('beforetoggle', onToggle);
      pop.removeEventListener('toggle', onToggle);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, []);

  return (
    <span className="inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        popoverTarget={id}
        className="btn btn-circle btn-xs border-0 bg-base-content/10 text-xs font-normal text-base-content/60 hover:bg-base-content/20"
        aria-label="About these stats"
      >
        ?
      </button>
      <div
        ref={popRef}
        id={id}
        popover="auto"
        style={{ inset: 'auto' }}
        className="rounded-box bg-base-200 text-base-content fixed m-0 max-h-[calc(100vh_-_1rem)] w-[min(22rem,calc(100vw_-_1rem))] overflow-y-auto p-4 pr-8 text-left text-sm font-normal shadow-xl"
      >
        <button
          type="button"
          popoverTarget={id}
          popoverTargetAction="hide"
          className="btn btn-circle btn-ghost btn-xs absolute right-1 top-1"
          aria-label="Close"
        >
          ✕
        </button>
        {children}
      </div>
    </span>
  );
}
