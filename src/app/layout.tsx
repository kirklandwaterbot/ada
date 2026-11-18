import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/app-shell";
import { SettingsProvider } from "@/components/settings-provider";
import { getRecentOpeningCount } from "@/lib/accessibility-news";
import "./globals.css";

// Atkinson Hyperlegible Next was drawn by the Braille Institute for
// low-vision readers — the right voice for an accessibility tracker. It is
// self-hosted (SIL Open Font License, see ./fonts/OFL.txt) so builds never
// depend on reaching Google Fonts.
const atkinson = localFont({
  display: "swap",
  src: [
    { path: "./fonts/atkinson-hyperlegible-next-latin-wght-normal.woff2", style: "normal", weight: "200 800" },
    { path: "./fonts/atkinson-hyperlegible-next-latin-wght-italic.woff2", style: "italic", weight: "200 800" },
  ],
  variable: "--font-atkinson",
});

export const metadata: Metadata = {
  title: {
    default: "Access NYC | Regional transit accessibility",
    template: "%s | Access NYC",
  },
  description:
    "Which stations you can reach without stairs: accessible stations, live elevator status, newly opened elevators with sources, and ADA projects across subway, PATH, AirTrain, commuter rail, light rail, and CTrail.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#000000" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      data-scroll-behavior="smooth"
      lang="en"
      suppressHydrationWarning
      className={[atkinson.variable, "h-full antialiased"].join(" ")}
    >
      <body suppressHydrationWarning className="min-h-full">
        <SettingsProvider>
          <AppShell recentOpeningCount={getRecentOpeningCount()}>{children}</AppShell>
        </SettingsProvider>
      </body>
    </html>
  );
}
