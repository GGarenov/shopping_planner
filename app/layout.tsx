import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { INSTALL_CAPTURE_SCRIPT } from "@/lib/pwa/captureScript";
import "./globals.css";

// Rounded, friendly face with full Cyrillic; self-hosted by Next at build time.
const nunito = Nunito({ subsets: ["latin", "cyrillic"], weight: ["500", "600", "700", "800"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: "Пазарен план",
  description: "Седмичен хранителен план и списък за пазаруване от eBag.bg",
  applicationName: "Пазарен план",
  appleWebApp: { capable: true, title: "Пазарен план", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b7d86", // status bar matches the turquoise header
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bg" className={nunito.variable}>
      <head>
        {/* Keep the browser's install event from the very first moment, for the «Добави в телефона» button. */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
