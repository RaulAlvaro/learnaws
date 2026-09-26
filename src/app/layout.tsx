import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Nav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Learn AWS · SAA-C03",
  description: "Estudio personal para AWS Solutions Architect Associate con métodos basados en evidencia.",
  appleWebApp: { capable: true, title: "Learn AWS", statusBarStyle: "default" },
  icons: { apple: "/icons/180" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#111110" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="min-h-full bg-bg font-sans text-fg">
          <Nav />
          <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:pt-6">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
