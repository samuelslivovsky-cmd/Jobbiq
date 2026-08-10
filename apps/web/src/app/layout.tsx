import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jobbiq",
  description: "Job search & apply automation",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-100 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
