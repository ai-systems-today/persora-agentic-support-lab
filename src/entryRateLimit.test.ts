import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeEntryRateLimit,
  ENTRY_RATE_LIMIT,
  resetEntryRateLimitsForTests,
} from "../supabase/functions/_shared/entryRateLimit";

describe("entry-point rate limiter", () => {
  beforeEach(resetEntryRateLimitsForTests);

  it("allows the configured window and then blocks", () => {
    for (let index = 0; index < ENTRY_RATE_LIMIT.maxRequests; index += 1) {
      expect(consumeEntryRateLimit("caller", 1_000).allowed).toBe(true);
    }
    expect(consumeEntryRateLimit("caller", 1_000)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("opens a new window after the fixed interval", () => {
    for (let index = 0; index <= ENTRY_RATE_LIMIT.maxRequests; index += 1) consumeEntryRateLimit("caller", 1_000);
    expect(consumeEntryRateLimit("caller", 1_000 + ENTRY_RATE_LIMIT.windowMs)).toMatchObject({ allowed: true });
  });
});
