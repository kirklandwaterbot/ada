import Link from "next/link";
import { SiteIcon } from "@/components/site-icon";

export default function NotFound() {
  return (
    <div className="page-enter grid min-h-[70vh] place-items-center">
      <div className="surface-card max-w-lg p-8 text-center sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--soft-blue)] text-[var(--accent-600)]">
          <SiteIcon className="text-[30px]" name="wrong_location" />
        </span>
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--accent-600)]">
          Station not found
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--ink)]">
          This stop is not in the directory
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">
          The station link may be outdated, or the station name may have changed in the source workbook.
        </p>
        <Link
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--nav-active)] px-4 text-sm font-bold text-white"
          href="/stations"
        >
          <SiteIcon className="text-[18px]" name="search" />
          Browse all stations
        </Link>
      </div>
    </div>
  );
}
