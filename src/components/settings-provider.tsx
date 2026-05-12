"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ThemeMode = "system" | "light" | "dark";
type AccentColor = "teal" | "sky" | "violet" | "rose";
type TableDensity = "comfortable" | "compact";

type Settings = {
  accentColor: AccentColor;
  tableDensity: TableDensity;
  theme: ThemeMode;
};

type SettingsContextValue = {
  lastSavedAt: number | null;
  settings: Settings;
  updateSettings: (nextSettings: Partial<Settings>) => void;
};

const STORAGE_KEY = "mta-access-assets-settings";

const DEFAULT_SETTINGS: Settings = {
  accentColor: "teal",
  tableDensity: "comfortable",
  theme: "system",
};

const ACCENT_OPTIONS: Record<
  AccentColor,
  {
    color: string;
    dark: string;
    light: string;
    ring: string;
    rgb: string;
  }
> = {
  teal: {
    color: "#0d9488",
    dark: "#0f766e",
    light: "#f0fdfa",
    ring: "rgba(20, 184, 166, 0.32)",
    rgb: "13, 148, 136",
  },
  sky: {
    color: "#0284c7",
    dark: "#0369a1",
    light: "#f0f9ff",
    ring: "rgba(14, 165, 233, 0.32)",
    rgb: "2, 132, 199",
  },
  violet: {
    color: "#7c3aed",
    dark: "#6d28d9",
    light: "#f5f3ff",
    ring: "rgba(124, 58, 237, 0.28)",
    rgb: "124, 58, 237",
  },
  rose: {
    color: "#e11d48",
    dark: "#be123c",
    light: "#fff1f2",
    ring: "rgba(225, 29, 72, 0.26)",
    rgb: "225, 29, 72",
  },
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => readStoredSettings());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const accent = ACCENT_OPTIONS[settings.accentColor];
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = settings.theme === "dark" || (settings.theme === "system" && systemDark);

    root.classList.toggle("dark", isDark);
    root.dataset.accent = settings.accentColor;
    root.dataset.density = settings.tableDensity;
    root.style.setProperty("--accent-50", accent.light);
    root.style.setProperty("--accent-500", accent.color);
    root.style.setProperty("--accent-600", accent.color);
    root.style.setProperty("--accent-700", accent.dark);
    root.style.setProperty("--accent-600-rgb", accent.rgb);
    root.style.setProperty("--accent-ring", accent.ring);
  }, [settings]);

  const updateSettings = useCallback((nextSettings: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...nextSettings };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setLastSavedAt(Date.now());
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ lastSavedAt, settings, updateSettings }),
    [lastSavedAt, settings, updateSettings],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error("useSettings must be used inside SettingsProvider");
  }

  return context;
}

export const accentOptions = [
  { value: "teal", label: "Teal", swatch: ACCENT_OPTIONS.teal.color },
  { value: "sky", label: "Sky", swatch: ACCENT_OPTIONS.sky.color },
  { value: "violet", label: "Violet", swatch: ACCENT_OPTIONS.violet.color },
  { value: "rose", label: "Rose", swatch: ACCENT_OPTIONS.rose.color },
] satisfies Array<{ value: AccentColor; label: string; swatch: string }>;

export const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] satisfies Array<{ value: ThemeMode; label: string }>;

function isAccentColor(value: unknown): value is AccentColor {
  return value === "teal" || value === "sky" || value === "violet" || value === "rose";
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function readStoredSettings(): Settings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<Settings>;

    return {
      accentColor: isAccentColor(parsed.accentColor)
        ? parsed.accentColor
        : DEFAULT_SETTINGS.accentColor,
      tableDensity: parsed.tableDensity === "compact" ? "compact" : "comfortable",
      theme: isThemeMode(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
