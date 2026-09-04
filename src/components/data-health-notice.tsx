import { SiteIcon } from "@/components/site-icon";
import { getDataHealthStatus } from "@/lib/data-health";
import type { DataMetadata } from "@/lib/mta-assets";

export function DataHealthNotice({ metadata }: { metadata: DataMetadata }) {
  const status = getDataHealthStatus(metadata);

  if (!status) {
    return null;
  }

  const isError = status.severity === "error";

  return (
    <div
      className={[
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
        isError
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"
          : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100",
      ].join(" ")}
      role={isError ? "alert" : "status"}
    >
      <SiteIcon
        className="mt-0.5 shrink-0 text-[20px]"
        name={isError ? "error" : "database"}
      />
      <div>
        <p className="font-extrabold">{status.title}</p>
        <p className="mt-0.5 text-xs leading-5 opacity-85">{status.message}</p>
      </div>
    </div>
  );
}
