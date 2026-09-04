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
    default: "Access NYC | Subway accessibility",
    template: "%s | Access NYC",
  },
  description:
    "Explore accessibility, equipment status, and planned ADA improvements across New York City subway stations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
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
