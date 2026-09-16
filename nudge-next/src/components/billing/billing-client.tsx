"use client";

/**
 * BillingClient — the interactive Billing surface (plan §6/§7).
 *
 * Renders: current plan + status, live usage progress bars (contacts / sends /
 * lists / numbers), and the 5 INR plan cards. Owner/admin (canManageBilling)
 * can start a subscription via Razorpay Checkout (subscription mode) — the
 * `createSubscription` action returns the subscription id + the public key id,
 * and Checkout opens against it.
 *
 * R7: the Checkout handler is UX ONLY — it shows a "we're activating your plan"
 * toast and refreshes; the AUTHORITATIVE plan/status transition happens in the
 * Razorpay webhook. We never grant entitlements from this client.
 */

import * as React from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { UsageSummary, UsageMeter } from "@/lib/billing/entitlements";
import { createSubscription } from "@/features/billing/actions";

interface PlanCard {
  id: string;
  name: string;
  priceInr: number;
  maxContacts: number;
  maxSends: number;
  maxLists: number;
  maxNumbers: number;
  features: string[];
}

export interface BillingClientProps {
  plans: PlanCard[];
  usage: UsageSummary;
  canManageBilling: boolean;
  razorpayKeyId: string;
}

// Minimal Razorpay Checkout typing for the subscription-mode widget.
interface RazorpayCheckoutOptions {
  key: string;
  subscription_id: string;
  name: string;
  description?: string;
  handler?: (response: unknown) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
}
interface RazorpayInstance {
  open: () => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

const STATUS_LABEL: Record<string, string> = {
  none: "No subscription",
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  halted: "Halted",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  none: "outline",
  trialing: "secondary",
  active: "default",
  past_due: "destructive",
  halted: "destructive",
  cancelled: "outline",
};

function inr(n: number): string {
  return n === 0 ? "Free" : `₹${n.toLocaleString("en-IN")}`;
}

function UsageBar({ label, meter }: { label: string; meter: UsageMeter }) {
  const pct =
    meter.limit > 0 ? Math.min(100, Math.round((meter.used / meter.limit) * 100)) : 0;
  const danger = pct >= 90;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {meter.used.toLocaleString("en-IN")} /{" "}
          {meter.limit.toLocaleString("en-IN")}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            danger ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function BillingClient({
  plans,
  usage,
  canManageBilling,
  razorpayKeyId,
}: BillingClientProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [scriptReady, setScriptReady] = React.useState(false);

  const currentPlan = usage.plan;

  async function startSubscription(planId: string) {
    if (!canManageBilling) {
      toast.error("Only an owner or admin can manage billing.");
      return;
    }
    setPending(planId);
    try {
      const params = await createSubscription(planId);

      if (!window.Razorpay || !scriptReady) {
        toast.success(
          "Subscription created. Complete payment in Razorpay to activate.",
        );
        router.refresh();
        return;
      }

      const rzp = new window.Razorpay({
        key: razorpayKeyId || params.keyId,
        subscription_id: params.subscriptionId,
        name: "Revqara",
        description: `${params.planName} plan`,
        theme: { color: "#10b981" },
        handler: () => {
          // R7: UX only — activation is webhook-driven.
          toast.success("Payment received — activating your plan…");
          router.refresh();
        },
        modal: {
          ondismiss: () => {
            toast.message("Checkout closed. You can resume anytime.");
            router.refresh();
          },
        },
      });
      rzp.open();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not start the subscription.";
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-8">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onLoad={() => setScriptReady(true)}
      />

      {/* Current plan + live usage */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="capitalize">
                  {plans.find((p) => p.id === currentPlan)?.name ?? currentPlan}
                </span>
                <Badge variant={STATUS_VARIANT[usage.planStatus] ?? "outline"}>
                  {STATUS_LABEL[usage.planStatus] ?? usage.planStatus}
                </Badge>
              </CardTitle>
              <CardDescription>
                Live usage against your current plan limits.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <UsageBar label="Contacts" meter={usage.contacts} />
          <UsageBar label="Sends today" meter={usage.sendsToday} />
          <UsageBar label="Lists" meter={usage.lists} />
          <UsageBar label="WhatsApp numbers" meter={usage.numbers} />
        </CardContent>
      </Card>

      {/* Plan cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Plans</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isFree = plan.priceInr === 0;
            const busy = pending === plan.id;
            return (
              <Card
                key={plan.id}
                className={cn(isCurrent && "border-primary ring-1 ring-primary")}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{plan.name}</span>
                    {isCurrent && <Badge variant="secondary">Current</Badge>}
                  </CardTitle>
                  <CardDescription>
                    <span className="text-2xl font-bold text-foreground">
                      {inr(plan.priceInr)}
                    </span>
                    {!isFree && (
                      <span className="text-muted-foreground"> /mo</span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-1.5 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {!isFree && !isCurrent && (
                    <Button
                      className="w-full"
                      disabled={!canManageBilling || busy}
                      onClick={() => startSubscription(plan.id)}
                    >
                      {busy && (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      )}
                      Start 14-day trial
                    </Button>
                  )}
                  {isFree && !isCurrent && (
                    <p className="text-center text-xs text-muted-foreground">
                      Downgrade by cancelling your subscription.
                    </p>
                  )}
                  {isCurrent && (
                    <p className="text-center text-xs text-muted-foreground">
                      Your active plan.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        {!canManageBilling && (
          <p className="mt-3 text-sm text-muted-foreground">
            Only a workspace owner or admin can change the plan.
          </p>
        )}
      </div>
    </div>
  );
}
