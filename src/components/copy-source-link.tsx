"use client";

import { useState } from "react";

export function CopySourceLink({ href, label }: { href: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 font-mono text-xs text-[var(--accent-700)] transition hover:bg-[var(--accent-50)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-[rgb(var(--accent-600-rgb)_/_0.16)]">
      <div className="flex items-start gap-2">
        <a className="min-w-0 flex-1" href={href} rel="noreferrer" target="_blank">
          <span className="block font-sans text-xs font-semibold uppercase text-zinc-400 dark:text-zinc-500">
            {label}
          </span>
          <span className="mt-1 block truncate">{href}</span>
        </a>
        <button
          aria-label={`Copy ${label}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white hover:text-[var(--accent-700)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          onClick={copyUrl}
          title={copied ? "Copied" : "Copy"}
          type="button"
        >
          <ContentCopyIcon />
        </button>
      </div>
      <span
        aria-live="polite"
        className="mt-1 block h-4 font-sans text-[11px] font-semibold text-zinc-400 dark:text-zinc-500"
      >
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}

function ContentCopyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="currentColor"
      viewBox="0 -960 960 960"
    >
      <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Z" />
    </svg>
  );
}
