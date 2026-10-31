import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KitShowcase } from "./kit-showcase";

export const metadata: Metadata = {
  title: "Kit",
  robots: { index: false },
};

/**
 * Dev-only showcase of the Pastel Pop kit (docs/redesign/03-code-mapping.md
 * §3), in the current theme and forced dark side by side. Production builds
 * answer 404, like the phase strip on /r/[code].
 */
export default function KitPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <KitShowcase />;
}
