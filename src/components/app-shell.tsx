"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SettingsButton } from "@/components/settings-panel";
import { SiteIcon } from "@/components/site-icon";

const navigation = [
  { href: "/", icon: "space_dashboard", label: "Overview" },
  { href: "/stations", icon: "map", label: "Explore system" },
  { href: "/equipment", icon: "elevator", label: "Equipment" },
  { href: "/projects", icon: "construction", label: "Capital projects" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--ink)]">
      <a
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-xl bg-[var(--nav-active)] px-4 py-3 text-sm font-bold text-white shadow-xl transition focus:translate-y-0"
        href="#main-content"
      >
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-[var(--border)] bg-[var(--panel)] lg:flex">
        <Sidebar pathname={pathname} />
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[rgb(var(--panel-rgb)_/_0.92)] px-4 backdrop-blur-xl lg:hidden">
        <Brand compact />
        <button
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] shadow-sm transition hover:text-[var(--ink)]"
          onClick={() => setMobileOpen((open) => !open)}
          type="button"
        >
          <SiteIcon className="text-[22px]" name={mobileOpen ? "close" : "menu"} />
        </button>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,19rem)] flex-col border-r border-[var(--border)] bg-[var(--panel)] shadow-2xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} pathname={pathname} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-72">
        <main
          className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  onNavigate,
  pathname,
}: {
  onNavigate?: () => void;
  pathname: string;
}) {
  return (
    <>
      <div className="border-b border-[var(--border)] px-6 py-6">
        <Brand onNavigate={onNavigate} />
      </div>

      <nav aria-label="Primary navigation" className="flex-1 px-4 py-5">
        <p className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
          Explore
        </p>
        <div className="mt-3 space-y-1.5">
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={[
                  "group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition",
                  active
                    ? "bg-[var(--nav-active)] text-white shadow-[0_10px_24px_rgb(10_61_126_/_0.22)]"
                    : "text-[var(--muted-strong)] hover:bg-[var(--soft)] hover:text-[var(--ink)]",
                ].join(" ")}
                href={item.href}
                key={item.href}
                onClick={onNavigate}
              >
                <SiteIcon
                  className={[
                    "text-[20px]",
                    active
                      ? "text-cyan-200"
                      : "text-[var(--muted)] group-hover:text-[var(--accent-600)]",
                  ].join(" ")}
                  name={item.icon}
                />
                {item.label}
                {active ? (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="space-y-4 border-t border-[var(--border)] p-4">
        <div className="rounded-2xl bg-[var(--nav-active)] p-4 text-white shadow-[0_14px_34px_rgb(10_61_126_/_0.22)]">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-200">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            Daily data snapshot
          </div>
          <p className="mt-2 text-sm leading-5 text-blue-100">
            Equipment and capital project data are checked against official sources daily.
          </p>
          <Link
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
            href="/equipment"
          >
            Review equipment
            <SiteIcon className="text-[16px]" name="arrow_forward" />
          </Link>
        </div>
        <div className="flex items-center justify-between gap-3">
          <SettingsButton compact />
          <span className="text-[11px] font-medium text-[var(--muted)]">Independent tool</span>
        </div>
      </div>
    </>
  );
}

function Brand({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link className="flex min-w-0 items-center gap-3" href="/" onClick={onNavigate}>
      <span
        className={[
          compact ? "h-9 w-9" : "h-11 w-11",
          "grid shrink-0 place-items-center overflow-hidden",
        ].join(" ")}
      >
        <Image
          alt="MTA"
          className="h-full w-full translate-x-px object-contain p-1"
          height={44}
          loading="eager"
          src="/MTA.png"
          width={44}
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-extrabold tracking-[-0.01em] text-[var(--ink)]">
          Access NYC
        </span>
        <span className="block truncate text-xs font-medium text-[var(--muted)]">
          Subway accessibility
        </span>
      </span>
    </Link>
  );
}
