import Image from "next/image";
import { SubwayRouteIcons } from "@/components/subway-route-icons";
import type { RegionalTransitBadge } from "@/lib/regional-transit-branding";

export function TransitRouteIcons({
  agency,
  className = "mt-1.5",
  regionalBadges = [],
  routes,
}: {
  agency: string;
  className?: string;
  regionalBadges?: RegionalTransitBadge[];
  routes: string[];
}) {
  if (agency === "NYCTA") {
    return <SubwayRouteIcons className={className} routes={routes} />;
  }

  if (regionalBadges.length === 0) return null;

  return (
    <div className={`${className} flex flex-wrap items-center gap-1.5`}>
      {regionalBadges.map((badge) => (
        <Image
          alt={badge.label}
          className="max-w-16 object-contain"
          height={20}
          key={`${badge.imagePath}-${badge.label}`}
          src={badge.imagePath}
          style={{ height: "20px", width: "auto" }}
          title={badge.label}
          width={64}
        />
      ))}
    </div>
  );
}
