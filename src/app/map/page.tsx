import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "System map",
  description:
    "Interactive accessibility map for subway, PATH, AirTrain, commuter rail, light rail, and CTrail stations.",
};

export default function MapPage() {
  redirect("/stations?view=map");
}
