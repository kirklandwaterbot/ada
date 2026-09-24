import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { SettingsProvider } from "@/components/settings-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Access NYC | Regional transit accessibility",
    template: "%s | Access NYC",
  },
  description:
    "Explore accessible stations, equipment status, and ADA improvements across subway, PATH, AirTrain, commuter rail, light rail, and CTrail.",
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
      className={[geistSans.variable, geistMono.variable, "h-full antialiased"].join(" ")}
    >
      <body suppressHydrationWarning className="min-h-full">
        <SettingsProvider>
          <AppShell>{children}</AppShell>
        </SettingsProvider>
      </body>
    </html>
  );
}
