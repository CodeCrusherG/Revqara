"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { EASE, DURATION } from "@/components/motion/pageVariants";

interface RevealProps extends HTMLMotionProps<"div"> {
  delay?: number;
  y?: number;
  /** Re-trigger every time it scrolls into view. Defaults to false (once). */
  repeat?: boolean;
}

/** Scroll-triggered entrance using whileInView. Transform/opacity only. */
export function Reveal({
  delay = 0,
  y = 16,
  repeat = false,
  children,
  ...props
}: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: !repeat, margin: "0px 0px -10% 0px" }}
      transition={{ duration: DURATION.slow, ease: EASE, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
