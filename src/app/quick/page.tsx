import type { Metadata } from "next";
import { QuickPage } from "@/components/game/quick-page";

export const metadata: Metadata = {
  title: "Quick match",
  description: "Get paired with someone for five quick rounds.",
};

export default function Quick() {
  return <QuickPage />;
}
