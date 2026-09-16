"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useOrganizationList } from "@clerk/nextjs";
import { Loader2, Sparkles } from "lucide-react";

import { createWorkspace } from "@/features/workspaces/actions";
import { DEFAULT_VERTICAL, VERTICAL_OPTIONS } from "@/lib/config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function OnboardingForm() {
  const router = useRouter();
  const { isLoaded, setActive } = useOrganizationList();

  const [name, setName] = React.useState("");
  const [vertical, setVertical] = React.useState<string>(DEFAULT_VERTICAL);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Workspace name is required.");
      return;
    }
    setPending(true);
    try {
      // Server action: creates the Clerk Organization (caller = owner) and
      // mirrors the Appwrite workspaces + bots docs.
      const ws = await createWorkspace({ name: trimmed, vertical });
      // Make the new workspace the active org for this browser session
      // (Clerk server-verifies membership — replaces the old switch endpoint).
      if (setActive) {
        await setActive({ organization: ws.id });
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create the workspace. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-5 w-5" />
        </div>
        <CardTitle className="text-2xl">Create your workspace</CardTitle>
        <CardDescription>
          Name your workspace and pick your industry — Revqara tunes the AI
          pipeline, pipeline stages, and replies to your vertical.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="ws-name">Workspace name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Coaching Institute"
              autoFocus
              disabled={pending}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ws-vertical">Industry</Label>
            <Select
              value={vertical}
              onValueChange={setVertical}
              disabled={pending}
            >
              <SelectTrigger id="ws-vertical">
                <SelectValue placeholder="Choose your industry" />
              </SelectTrigger>
              <SelectContent>
                {VERTICAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={pending || !isLoaded}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
