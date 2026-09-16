"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { VerticalIcon } from "@/components/marketing/vertical-icon";
import { MARKETING_VERTICALS } from "@/lib/marketing/verticals";

/**
 * The 12-vertical grid. Each card links to its specialist page
 * (`/verticals/[slug]`). Client island only for the framer stagger entrance —
 * the data is static, so this stays SSG-friendly.
 */
export function VerticalGrid() {
  return (
    <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {MARKETING_VERTICALS.map((v) => (
        <StaggerItem key={v.slug}>
          <Link href={`/verticals/${v.slug}`} className="group block h-full">
            <Card className="lift flex h-full flex-col p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <VerticalIcon name={v.icon} className="h-5 w-5" />
                </span>
                <h3 className="text-base font-semibold leading-tight">
                  {v.label}
                </h3>
              </div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">
                {v.tagline}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                See the {v.specialist} pitch
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Card>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
