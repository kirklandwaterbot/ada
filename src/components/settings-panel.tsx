"use client";

import { useEffect, useState } from "react";
import {
  accentOptions,
  themeOptions,
  useSettings,
} from "@/components/settings-provider";

export function SettingsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label="Open settings"
        className="inline-flex h-10 items-center justify-center rounded-full bg-white px-4 text-sm font-medium text-zinc-800 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur transition hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-zinc-700"
        onClick={() => setOpen(true)}
        type="button"
      >
        Settings
      </button>
      {open ? <SettingsPanel onClose={() => setOpen(false)} /> : null}
      <SettingsSavedToast />
    </>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close settings"
        className="absolute inset-0 bg-zinc-800/40 backdrop-blur-sm dark:bg-black/70"
        onClick={onClose}
        type="button"
      />
      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-l-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Settings
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              These preferences are saved in this browser.
            </p>
          </div>
          <button
            aria-label="Close settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        <div className="mt-8 flex-1 space-y-8 overflow-y-auto">
          <SettingsSection
            description="Choose how the site follows your display."
            title="Theme"
          >
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map((option) => (
                <ChoiceButton
                  active={settings.theme === option.value}
                  ariaLabel={`Use ${option.label.toLowerCase()} theme`}
                  key={option.value}
                  onClick={() => updateSettings({ theme: option.value })}
                  title={option.label}
                >
                  <MaterialIcon name={getThemeIconName(option.value)} />
                </ChoiceButton>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection
            description="Sets the primary color for buttons, focus rings, and table hover states."
            title="Accent color"
          >
            <div className="grid grid-cols-2 gap-2">
              {accentOptions.map((option) => (
                <ChoiceButton
                  active={settings.accentColor === option.value}
                  key={option.value}
                  onClick={() => updateSettings({ accentColor: option.value })}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: option.swatch }}
                  />
                  {option.label}
                </ChoiceButton>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection
            description="Compact mode fits more rows on screen."
            title="Table density"
          >
            <div className="grid grid-cols-2 gap-2">
              <ChoiceButton
                active={settings.tableDensity === "comfortable"}
                onClick={() => updateSettings({ tableDensity: "comfortable" })}
              >
                Comfortable
              </ChoiceButton>
              <ChoiceButton
                active={settings.tableDensity === "compact"}
                onClick={() => updateSettings({ tableDensity: "compact" })}
              >
                Compact
              </ChoiceButton>
            </div>
          </SettingsSection>
        </div>
      </aside>
    </div>
  );
}

function SettingsSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChoiceButton({
  active,
  ariaLabel,
  children,
  onClick,
  title,
}: {
  active: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={[
        "flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]",
        active
          ? "border-[var(--accent-600)] bg-[var(--accent-50)] text-[var(--accent-700)] shadow-inner dark:bg-[rgb(var(--accent-600-rgb)_/_0.24)] dark:text-zinc-50"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-800",
      ].join(" ")}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function MaterialIcon({ name }: { name: string }) {
  const path =
    name === "dark_mode"
      ? "M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Z"
      : name === "light_mode"
        ? "M480-280q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650 155-751l57-57 101 101-57 57Zm492 498L647-253l57-57 101 101-57 57Zm-98-552 101-101 57 57-101 101-57-57ZM154-209l101-101 57 57-101 101-57-57Z"
        : "M160-120q-33 0-56.5-23.5T80-200v-520q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v520q0 33-23.5 56.5T800-120H160Zm0-80h640v-520H160v520Zm160 160v-80h320v80H320Z";

  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="currentColor"
      viewBox="0 -960 960 960"
    >
      <path d={path} />
    </svg>
  );
}

function getThemeIconName(value: (typeof themeOptions)[number]["value"]) {
  if (value === "dark") {
    return "dark_mode";
  }

  if (value === "light") {
    return "light_mode";
  }

  return "computer";
}

function SettingsSavedToast() {
  const { lastSavedAt } = useSettings();
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const visible = lastSavedAt !== null && dismissedAt !== lastSavedAt;

  useEffect(() => {
    if (!lastSavedAt) return;
    const timeout = window.setTimeout(() => setDismissedAt(lastSavedAt), 2800);
    return () => window.clearTimeout(timeout);
  }, [lastSavedAt]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-2xl backdrop-blur dark:border-emerald-600/60 dark:bg-zinc-900/95 dark:text-emerald-300">
      Settings saved
    </div>
  );
}
