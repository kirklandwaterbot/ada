"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SettingsButton } from "@/components/settings-panel";
import { SiteIcon } from "@/components/site-icon";

const navigation = [
  { href: "/", icon: "map", label: "Map" },
  { href: "/stations", icon: "search", label: "Stations" },
  { href: "/equipment", icon: "elevator", label: "Equipment" },
  { href: "/projects", icon: "construction", label: "Projects" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mapHome = pathname === "/";

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--ink)]">
      <a
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-xl bg-[var(--nav-active)] px-4 py-3 text-sm font-bold text-white shadow-xl transition focus:translate-y-0"
        href="#main-content"
      >
        Skip to main content
      </a>
      {mapHome ? null : (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col border-r border-white/10 bg-[#111820] lg:flex">
          <Sidebar compact pathname={pathname} />
        </aside>
      )}

      {mapHome ? null : (
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
      )}

      {mobileOpen && !mapHome ? (
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

      <div className={mapHome ? "" : "lg:pl-20"}>
        <main
          className={
            mapHome
              ? "h-[100svh] min-h-[34rem] w-full p-0"
              : "mx-auto min-h-screen w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10"
          }
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
  compact = false,
  onNavigate,
  pathname,
}: {
  compact?: boolean;
  onNavigate?: () => void;
  pathname: string;
}) {
  return (
    <>
      <div
        className={
          compact
            ? "border-b border-white/10 px-3 py-4"
            : "border-b border-[var(--border)] px-6 py-6"
        }
      >
        <Brand iconOnly={compact} onNavigate={onNavigate} />
      </div>

      <nav
        aria-label="Primary navigation"
        className={compact ? "flex-1 px-3 py-4" : "flex-1 px-4 py-5"}
      >
        {compact ? null : (
          <p className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            Explore
          </p>
        )}
        <div className={compact ? "space-y-2" : "mt-3 space-y-1.5"}>
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={[
                  "group flex items-center rounded-xl text-sm font-semibold transition",
                  compact ? "h-12 justify-center px-0" : "gap-3 px-3 py-3",
                  compact
                    ? active
                      ? "bg-[#2f8fd8] text-white shadow-[0_12px_30px_rgb(0_0_0_/_0.28)]"
                      : "text-slate-400 hover:bg-white/10 hover:text-white"
                    : active
                      ? "bg-[var(--nav-active)] text-white shadow-[0_10px_24px_rgb(10_61_126_/_0.22)]"
                      : "text-[var(--muted-strong)] hover:bg-[var(--soft)] hover:text-[var(--ink)]",
                ].join(" ")}
                href={item.href}
                key={item.href}
                onClick={onNavigate}
                title={compact ? item.label : undefined}
              >
                <SiteIcon
                  className={[
                    compact ? "text-[22px]" : "text-[20px]",
                    compact
                      ? active
                        ? "text-white"
                        : "text-slate-400 group-hover:text-white"
                      : active
                        ? "text-cyan-200"
                        : "text-[var(--muted)] group-hover:text-[var(--accent-600)]",
                  ].join(" ")}
                  name={item.icon}
                />
                {compact ? <span className="sr-only">{item.label}</span> : item.label}
                {active && !compact ? (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <div
        className={
          compact
            ? "grid place-items-center border-t border-white/10 p-4"
            : "border-t border-[var(--border)] p-4"
        }
      >
        {compact ? (
          <SettingsButton iconOnly />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <SettingsButton compact />
            <span className="text-[11px] font-medium text-[var(--muted)]">
              Official data, checked daily
            </span>
          </div>
        )}
      </div>
    </>
  );
}

function Brand({
  compact = false,
  iconOnly = false,
  onNavigate,
}: {
  compact?: boolean;
  iconOnly?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      aria-label={iconOnly ? "Access NYC home" : undefined}
      className={[
        "flex min-w-0 items-center",
        iconOnly ? "justify-center" : "gap-3",
      ].join(" ")}
      href="/"
      onClick={onNavigate}
    >
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
      {iconOnly ? null : <span className="min-w-0">
        <span className="block truncate text-sm font-extrabold tracking-[-0.01em] text-[var(--ink)]">
          Access NYC
        </span>
        <span className="block truncate text-xs font-medium text-[var(--muted)]">
          Subway accessibility
        </span>
      </span>}
    </Link>
  );
}
