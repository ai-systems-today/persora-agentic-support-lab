export type VerifiedNetflixErrorCode = {
  code: string;
  title: string;
  url: string;
  verifiedAt: string;
};

export const VERIFIED_NETFLIX_ERROR_CODES: readonly VerifiedNetflixErrorCode[] = [
  {
    code: "NW-2-5",
    title: "Netflix Error NW-2-5",
    url: "https://help.netflix.com/en/node/14424",
    verifiedAt: "2026-09-19",
  },
  {
    code: "NW-3-16",
    title: "Netflix Error NW-3-16",
    url: "https://help.netflix.com/en/node/22210",
    verifiedAt: "2026-09-19",
  },
] as const;

const verifiedCodes = new Set(VERIFIED_NETFLIX_ERROR_CODES.map(({ code }) => code));

export const extractNetflixErrorCodes = (value: string): string[] => Array.from(
  new Set(value.toUpperCase().match(/\b[A-Z]{1,4}-\d+(?:-\d+)*\b/g) ?? []),
);

export function unknownNetflixErrorCode(value: string): string | null {
  return extractNetflixErrorCodes(value).find((code) => code.startsWith("NW-") && !verifiedCodes.has(code)) ?? null;
}

export function unknownNetflixErrorResponse(value: string): string | null {
  const code = unknownNetflixErrorCode(value);
  if (!code) return null;
  return `I could not find an official Netflix error ${code}. Please verify the code. Did you mean NW-3-16, NW-2-5, or another NW error?`;
}
