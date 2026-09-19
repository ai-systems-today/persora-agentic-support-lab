import { describe, expect, it } from "vitest";
import {
  extractNetflixErrorCodes,
  unknownNetflixErrorCode,
  unknownNetflixErrorResponse,
  VERIFIED_NETFLIX_ERROR_CODES,
} from "../supabase/functions/_shared/netflixErrorCodes";

describe("verified Netflix error-code gate", () => {
  it("recognizes only checked-in official codes", () => {
    expect(VERIFIED_NETFLIX_ERROR_CODES.map(({ code }) => code)).toEqual(["NW-2-5", "NW-3-16"]);
    expect(unknownNetflixErrorCode("Netflix shows NW-2-5")).toBeNull();
    expect(unknownNetflixErrorCode("Netflix shows nw-3-16")).toBeNull();
  });

  it("fails closed for an unknown NW code", () => {
    expect(unknownNetflixErrorResponse("I see NW-23")).toBe(
      "I could not find an official Netflix error NW-23. Please verify the code. Did you mean NW-3-16, NW-2-5, or another NW error?",
    );
  });

  it("does not intercept unrelated identifiers", () => {
    expect(extractNetflixErrorCodes("Reference ABC-123 and nw-23")).toEqual(["ABC-123", "NW-23"]);
    expect(unknownNetflixErrorResponse("Reference ABC-123")).toBeNull();
  });
});
