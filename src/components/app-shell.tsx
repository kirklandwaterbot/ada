"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { SettingsButton } from "@/components/settings-panel";
import { useSettings } from "@/components/settings-provider";
import { SiteIcon } from "@/components/site-icon";

const navigation = [
  { href: "/", icon: "map", label: "Map" },
  { href: "/stations", icon: "subway", label: "Stations" },
  { href: "/equipment", icon: "elevator", label: "Equipment" },
  { href: "/projects", icon: "construction", label: "Projects" },
  { href: "/updates", icon: "news", label: "Updates" },
] as const;

export function AppShell({
  children,
  recentOpeningCount = 0,
}: {
  children: React.ReactNode;
  recentOpeningCount?: number;
}) {
  const pathname = usePathname();
  const mapHome = pathname === "/";

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--ink)]">
      <a
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-[var(--route-yellow)] px-4 py-3 text-sm font-bold text-black shadow-xl transition focus:translate-y-0"
        href="#main-content"
      >
        Skip to main content
      </a>

      {mapHome ? null : (
        <header className="sticky top-0 z-30 bg-black text-white">
          {/* The white rule that runs along the top of every subway sign. */}
          <div aria-hidden="true" className="absolute inset-x-0 top-[6px] h-[2px] bg-white/90" />
          <div className="mx-auto flex h-[4.25rem] max-w-[1600px] items-center gap-6 px-4 pt-1.5 sm:px-6 xl:px-10">
            <Brand />
            <nav aria-label="Primary navigation" className="hidden h-full flex-1 items-stretch gap-1 md:flex">
              {navigation.map((item) => (
                <NavLink
                  badge={item.href === "/updates" ? recentOpeningCount : 0}
                  item={item}
                  key={item.href}
                  pathname={pathname}
                />
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <SettingsButton iconOnly tone="sign" />
            </div>
          </div>
        </header>
      )}

      <main
        className={
          mapHome
            ? "h-[100svh] min-h-[34rem] w-full p-0"
            : "mx-auto min-h-screen w-full max-w-[1600px] px-4 pb-28 pt-6 sm:px-6 sm:pt-8 md:pb-12 xl:px-10"
        }
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>

      {mapHome ? null : (
        <nav
          aria-label="Primary navigation"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-white/15 bg-black pb-[env(safe-area-inset-bottom)] text-white md:hidden"
        >
          <ul className="grid grid-cols-5">
            {navigation.map((item) => {
              const active = isActive(item.href, pathname);
              return (
                <li key={item.href}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={[
                      "relative flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-semibold",
                      active ? "text-white" : "text-white/65 hover:text-white",
                    ].join(" ")}
                    href={item.href}
                  >
                    {active ? (
                      <span aria-hidden="true" className="absolute inset-x-4 top-0 h-[3px] rounded-b bg-white" />
                    ) : null}
                    <span className="relative">
                      <SiteIcon className="text-[22px]" name={item.icon} />
                      {item.href === "/updates" && recentOpeningCount > 0 ? (
                        <UpdateDot count={recentOpeningCount} />
                      ) : null}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLink({
  badge,
  item,
  pathname,
}: {
  badge: number;
  item: (typeof navigation)[number];
  pathname: string;
}) {
  const active = isActive(item.href, pathname);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex items-center gap-2 px-3 text-[15px] font-semibold transition-colors",
        active ? "text-white" : "text-white/65 hover:text-white",
      ].join(" ")}
      href={item.href}
    >
      <SiteIcon className="text-[18px]" name={item.icon} />
      {item.label}
      {badge > 0 ? (
        <span
          aria-label={`${badge} newly accessible station${badge === 1 ? "" : "s"}`}
          className="route-bullet h-5 min-w-5 bg-[var(--route-green)] px-1.5 text-[11px]"
        >
          {badge}
        </span>
      ) : null}
      {active ? (
        <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-white" />
      ) : null}
    </Link>
  );
}

function UpdateDot({ count }: { count: number }) {
  return (
    <span
      aria-label={`${count} newly accessible`}
      className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--route-green)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-black"
    >
      {count}
    </span>
  );
}

function Brand() {
  return (
    <Link aria-label="Access NYC home" className="flex shrink-0 items-center gap-3" href="/">
      <Image
        alt=""
        className="h-9 w-9 object-contain"
        height={36}
        loading="eager"
        src="/MTA.png"
        width={36}
      />
      <span className="hidden text-[19px] font-bold tracking-[-0.01em] sm:block">
        Access NYC
      </span>
    </Link>
  );
}

const subscribeToTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["class"], attributes: true });
  return () => observer.disconnect();
};

function ThemeToggle() {
  const { updateSettings } = useSettings();
  const dark = useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  return (
    <button
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="grid h-10 w-10 place-items-center rounded-md text-white/75 transition hover:bg-white/10 hover:text-white"
      onClick={() => updateSettings({ theme: dark ? "light" : "dark" })}
      type="button"
    >
      <SiteIcon className="text-[19px]" name={dark ? "light_mode" : "dark_mode"} />
    </button>
  );
}
