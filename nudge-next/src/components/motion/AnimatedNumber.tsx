"use client";

import * as React from "react";
import { useSpring, useTransform, motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  /** Decimal places to display. Defaults to 0. */
  decimals?: number;
  /** Animate only once it scrolls into view. Defaults to true. */
  startOnView?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Spring-animated counter rendered with tabular-nums to avoid width jitter.
 * Transform/opacity-friendly: only the text content changes.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  startOnView = true,
  prefix = "",
  suffix = "",
  className,
}: AnimatedNumberProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });

  const spring = useSpring(0, { stiffness: 80, damping: 20, mass: 0.8 });
  const display = useTransform(spring, (latest) =>
    `${prefix}${latest.toFixed(decimals)}${suffix}`,
  );

  React.useEffect(() => {
    if (!startOnView || inView) {
      spring.set(value);
    }
  }, [spring, value, inView, startOnView]);

  return (
    <motion.span ref={ref} className={cn("tabular-nums", className)}>
      {display}
    </motion.span>
  );
}
