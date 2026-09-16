"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { EASE, DURATION } from "@/components/motion/pageVariants";

interface FadeInProps extends HTMLMotionProps<"div"> {
  delay?: number;
  /** Pixels of vertical travel on enter. Defaults to 8. */
  y?: number;
}

/** Simple opacity + transform entrance. Transform/opacity only. */
export function FadeIn({
  delay = 0,
  y = 8,
  children,
  ...props
}: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.standard, ease: EASE, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
