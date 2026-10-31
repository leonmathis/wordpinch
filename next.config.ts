import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The wordlist data file (gzipped ENABLE1, ~440KB) sits outside Next's
  // normal trace graph. This tells the build to bundle it with the
  // /api/words/validate route handler so it's available at runtime on
  // Vercel / standalone.
  outputFileTracingIncludes: {
    "/api/words/validate": ["./src/lib/words/data/**"],
    "/api/words/suggest": ["./src/lib/words/data/**"],
    // F4 peek picks its word from the same list.
    "/api/rooms/[code]/peek": ["./src/lib/words/data/**"],
    // F6 picks each day's letters from it and checks the words.
    "/api/daily": ["./src/lib/words/data/**"],
    "/api/daily/start": ["./src/lib/words/data/**"],
    "/api/daily/submit": ["./src/lib/words/data/**"],
    "/api/daily/card": ["./src/lib/words/data/**"],
    // F8 draws each round's letters from it.
    "/api/words/pair": ["./src/lib/words/data/**"],
  },
};

export default nextConfig;
