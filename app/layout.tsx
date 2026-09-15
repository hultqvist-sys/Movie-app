import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Navbar } from "@/components/layout/Navbar";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// NOTE: globals.css maps the Tailwind `font-sans` and `font-heading` tokens to
// `var(--font-sans)`, so the display font must be exposed under that exact
// variable name. create-next-app scaffolds `--font-geist-sans`, which left
// both tokens undefined.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Movie Night",
  description: "Discover, vote on, and track what the household watches next.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
