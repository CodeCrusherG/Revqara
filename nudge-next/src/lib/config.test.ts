import { describe, expect, it } from "vitest";
import {
  VERTICAL_SLUGS,
  VERTICAL_OPTIONS,
  GRAPH_VERSION,
  UNIVERSAL_PIPELINE,
} from "@/lib/config";

describe("config", () => {
  it("ships 12 vertical packs + custom (13 slugs)", () => {
    expect(VERTICAL_SLUGS).toHaveLength(13);
    expect(VERTICAL_SLUGS).toContain("custom");
    expect(VERTICAL_SLUGS).toContain("political_party");
  });

  it("labels every vertical option", () => {
    expect(VERTICAL_OPTIONS).toHaveLength(VERTICAL_SLUGS.length);
    for (const opt of VERTICAL_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it("pins the graph version to the ground-truth value", () => {
    expect(GRAPH_VERSION).toBe("0.6.1");
  });

  it("defines the universal pipeline", () => {
    expect(UNIVERSAL_PIPELINE[0]).toBe("new");
    expect(UNIVERSAL_PIPELINE).toContain("converted");
  });
});
