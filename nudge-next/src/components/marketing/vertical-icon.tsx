import {
  GraduationCap,
  Stethoscope,
  Building2,
  Scissors,
  ShoppingBag,
  Truck,
  Plane,
  Landmark,
  UtensilsCrossed,
  Dumbbell,
  Car,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import type { VerticalIconName } from "@/lib/marketing/verticals";

/**
 * Maps the lucide icon *name* stored in the pure data module
 * (`lib/marketing/verticals`) to the actual lucide component, so the data
 * module stays free of any React import and remains SSG-safe.
 */
const ICONS: Record<VerticalIconName, LucideIcon> = {
  GraduationCap,
  Stethoscope,
  Building2,
  Scissors,
  ShoppingBag,
  Truck,
  Plane,
  Landmark,
  UtensilsCrossed,
  Dumbbell,
  Car,
  ShieldCheck,
};

export function VerticalIcon({
  name,
  className,
}: {
  name: VerticalIconName;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}
