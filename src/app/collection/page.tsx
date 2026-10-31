import type { Metadata } from "next";
import { CollectionPage } from "@/components/game/collection-page";

export const metadata: Metadata = {
  title: "Your words · wordpinch",
  description: "Every word you've won or saved, with its meaning.",
};

export default function Collection() {
  return <CollectionPage />;
}
