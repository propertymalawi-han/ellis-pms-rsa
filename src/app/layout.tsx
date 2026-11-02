import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans } from "next/font/google";

import { Providers } from "@/components/providers";
import { APP_NAME } from "@/lib/constants";

import "./globals.css";

const sans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: "Private property management for Ellis Properties rentals in South Africa.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <body className={`${sans.variable} ${geistMono.variable} min-h-svh font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
