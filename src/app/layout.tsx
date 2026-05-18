import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
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
    default: "wordpinch",
    template: "%s — wordpinch",
  },
  description: "A real-time 2-player word game.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* `h-full overflow-hidden` (instead of `min-h-full`) is what
       *  finally locks the flex column to the viewport. With min-h-full
       *  the body had no DEFINITE height for `wp-root`'s `flex-1` to
       *  fill, so every child along the chain (wp-root → PhaseShell →
       *  wp-body) got sized to its content. A tall phase (e.g. result
       *  with definitions + suggestions) then pushed `body` past the
       *  viewport and the *browser* painted its own scrollbar — which
       *  `wp-body`'s `scrollbar-width: none` couldn't hide because
       *  it's on `html`, not on `wp-body`. `overflow-hidden` belt-and-
       *  suspenders this by clipping anything that might still escape. */}
      <body className="h-full overflow-hidden flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-center" richColors closeButton />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
