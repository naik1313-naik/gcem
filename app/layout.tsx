import type { Metadata } from "next";

import "./globals.css";
import "./windsage.css";

export const metadata: Metadata = {
  title: "WindSage AI",
  description: "Wind turbine alarm intelligence and maintenance operations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
