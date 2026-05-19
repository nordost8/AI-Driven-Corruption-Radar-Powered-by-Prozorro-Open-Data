import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { cn } from "@acme/ui";
import { ThemeProvider } from "@acme/ui/theme";
import { Toaster } from "@acme/ui/toast";

import { env } from "~/env";
import { TRPCReactProvider } from "~/trpc/react";

import "~/app/styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production"
      ? "https://corruption-radar.local"
      : "http://localhost:3000",
  ),
  title: "Корупційний радар",
  description: "Моніторинг ризик-сигналів у закупівлях Prozorro",
  openGraph: {
    title: "Корупційний радар",
    description: "Моніторинг ризик-сигналів у закупівлях Prozorro",
    url: "https://corruption-radar.local",
    siteName: "Корупційний радар",
  },
  twitter: {
    card: "summary_large_image",
    site: "@jullerino",
    creator: "@jullerino",
  },
};

export const viewport: Viewport = {
  themeColor: "#03090d",
};

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-[#03090d] font-sans text-slate-100 antialiased",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          <TRPCReactProvider>{props.children}</TRPCReactProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
