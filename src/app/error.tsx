"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="sign-plate px-6 pb-6 pt-10">
        <h1 className="text-[2rem] font-bold leading-tight">This page didn&apos;t load</h1>
        <p className="mt-2 text-white/75">
          Something went wrong while showing this page. Try again, or head to the station
          list.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="inline-flex h-11 items-center rounded-md bg-[var(--ink)] px-4 font-semibold text-[var(--app-bg)]"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
        <Link
          className="inline-flex h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold"
          href="/stations?view=explorer"
        >
          Browse stations
        </Link>
      </div>
    </div>
  );
}
