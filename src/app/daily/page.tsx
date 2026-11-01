import type { Metadata } from "next";
import { DailyPage } from "@/components/game/daily-page";

export const metadata: Metadata = {
  title: "Daily pinch",
  description: "Same two letters for everyone today. One try, and the clock starts with the letters.",
};

export default function Daily() {
  return <DailyPage />;
}
