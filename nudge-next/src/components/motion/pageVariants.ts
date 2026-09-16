import type { Variants } from "framer-motion";

/**
 * Shared easing + page-transition variants. Animate transform + opacity only.
 * Used by `(app)/template.tsx`, which re-mounts per navigation so the enter
 * animation replays on every route change.
 */
export const EASE = [0.16, 1, 0.3, 1] as const;

export const DURATION = {
  micro: 0.15,
  standard: 0.24,
  slow: 0.32,
} as const;

export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  enter: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.standard, ease: EASE },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: DURATION.micro, ease: EASE },
  },
};
