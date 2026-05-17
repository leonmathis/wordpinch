import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The wordlist data file (gzipped ENABLE1, ~440KB) sits outside Next's
  // normal trace graph. This tells the build to bundle it with the
  // /api/words/validate route handler so it's available at runtime on
  // Vercel / standalone.
  outputFileTracingIncludes: {
    "/api/words/validate": ["./src/lib/words/data/**"],
    "/api/words/suggest": ["./src/lib/words/data/**"],
  },
};

export default nextConfig;
