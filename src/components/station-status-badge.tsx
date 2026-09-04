import { SiteIcon } from "@/components/site-icon";
import { getAccessibilityTone, type Station } from "@/lib/stations";

type StationStatusBadgeProps = {
  compact?: boolean;
  station: Station;
};

const toneClasses = {
  accessible:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-500/10 dark:text-emerald-300",
  "not-accessible":
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-500/10 dark:text-slate-300",
  partial:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-500/10 dark:text-amber-300",
  planned:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700/60 dark:bg-blue-500/10 dark:text-blue-300",
};

export function StationStatusBadge({
  compact = false,
  station,
}: StationStatusBadgeProps) {
  const tone = getAccessibilityTone(station);
  const label =
    tone === "planned"
      ? "Planned"
      : station.accessibilityStatus === "Partially accessible"
        ? "Partial"
        : station.accessibilityStatus;

  return (
    <span
      className={[
        "inline-flex w-fit items-center gap-1.5 rounded-full border font-bold",
        compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs",
        toneClasses[tone],
      ].join(" ")}
    >
      <SiteIcon
        className={compact ? "text-[14px]" : "text-[16px]"}
        name={tone === "planned" ? "construction" : "accessible"}
      />
      {label}
    </span>
  );
}
