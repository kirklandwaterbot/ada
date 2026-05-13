import Image from "next/image";
import { getSubwayRouteIconPath } from "@/lib/asset-display";

export function SubwayRouteIcons({
  className = "mt-1.5",
  routes,
}: {
  className?: string;
  routes: string[];
}) {
  const displayRoutes = routes.filter((route) => !/^\d{4}-\d{2}-\d{2}$/.test(route));

  if (displayRoutes.length === 0) {
    return null;
  }

  return (
    <div className={`${className} flex flex-wrap items-center gap-1`}>
      {displayRoutes.map((route) => (
        <Image
          alt={`${route} train`}
          className="h-5 w-5"
          height={20}
          key={route}
          src={getSubwayRouteIconPath(route)}
          title={`${route} train`}
          width={20}
        />
      ))}
    </div>
  );
}
