import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "AFD India CRM",
  description: "AFD India — leads, admissions and fees, in one place.",
  /**
   * Never in a search result.
   *
   * This is an internal system holding students' names, phone numbers,
   * addresses and fee records. There is no version of it that belongs in
   * Google's index, and the login page is not a defence — a crawler that
   * reaches ANY URL here should be told to forget it, including the
   * public profile form, whose per-lead token would otherwise be sitting
   * in an index for anyone to find.
   *
   * Three layers, deliberately, because each covers what the others
   * cannot: this tag (every HTML page), `robots.ts` (crawlers that read
   * robots.txt before requesting anything), and an `X-Robots-Tag` header
   * in `next.config.ts` (responses with no HTML at all — PDFs, JSON,
   * anything a crawler fetches directly).
   */
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
