"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function CopySourceLink({ href, label }: { href: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 py-2 pl-3 pr-1.5 font-mono text-xs text-[var(--accent-700)] transition hover:bg-[var(--accent-50)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-[rgb(var(--accent-600-rgb)_/_0.16)]">
      <div className="flex items-start gap-2">
        <a className="min-w-0 flex-1" href={href} rel="noreferrer" target="_blank">
          <span className="block font-sans text-xs font-semibold uppercase text-zinc-400 dark:text-zinc-500">
            {label}
          </span>
          <span className="mt-1 block truncate">{href}</span>
        </a>
        <button
          aria-label={`Copy ${label}`}
          className="ml-auto inline-flex h-8 w-12 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white hover:text-[var(--accent-700)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          onClick={copyUrl}
          title={copied ? "Copied" : "Copy"}
          type="button"
        >
          <span aria-live="polite" className="inline-flex items-center justify-center">
            {copied ? (
              <span className="font-sans text-[11px] font-semibold">Copied</span>
            ) : (
              <Copy aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
