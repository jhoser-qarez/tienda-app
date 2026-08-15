import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Tienda App",
  description: "Control de ventas e inventario",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <SerwistProvider swUrl="/serwist/sw.js">
          <NavBar />
          <main className="flex-1 p-4">{children}</main>
        </SerwistProvider>
      </body>
    </html>
  );
}