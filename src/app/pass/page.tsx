import type { Metadata } from "next";
import { PassPage } from "@/components/game/pass-page";

export const metadata: Metadata = {
  title: "Pass the phone",
  description: "Two players, one device: take turns racing the same letters.",
};

export default function Pass() {
  return <PassPage />;
}
