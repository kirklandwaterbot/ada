import { SiteIcon } from "@/components/site-icon";
import {
  getAccessibilityTone,
  type StationAccessibilityView,
} from "@/lib/stations";

type StationStatusBadgeProps = {
  compact?: boolean;
  station: StationAccessibilityView;
};

// Status colours come from the subway's own route palette (see globals.css).
const toneClasses = {
  accessible:
    "text-[var(--status-accessible)] border-[color-mix(in_srgb,var(--status-accessible)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-accessible)_9%,transparent)]",
  "not-accessible":
    "text-[var(--status-none)] border-[color-mix(in_srgb,var(--status-none)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-none)_8%,transparent)]",
  partial:
    "text-[var(--status-partial)] border-[color-mix(in_srgb,var(--status-partial)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-partial)_9%,transparent)]",
  planned:
    "text-[var(--status-planned)] border-[color-mix(in_srgb,var(--status-planned)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-planned)_9%,transparent)]",
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
        "inline-flex w-fit items-center gap-1.5 rounded-md border font-bold",
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
