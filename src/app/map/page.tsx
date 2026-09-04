import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "System map",
  description:
    "Interactive map of subway accessibility, elevator and escalator assets, and planned ADA work.",
};

export default function MapPage() {
  redirect("/stations?view=map");
}
