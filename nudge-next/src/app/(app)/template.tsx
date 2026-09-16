"use client";

/**
 * Per-navigation page transition. `template.tsx` re-mounts on every route change
 * (unlike `layout.tsx`), so the enter animation replays. Animates transform +
 * opacity only; honors reduced-motion via the root <MotionConfig>.
 */

import * as React from "react";
import { motion } from "framer-motion";

import { pageVariants } from "@/components/motion/pageVariants";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="enter"
      exit="exit"
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
