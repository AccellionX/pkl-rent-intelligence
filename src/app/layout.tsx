import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "PKL Rent Intelligence",
  description:
    "Premium rental pricing intelligence for PKL Management LLC — portfolio analytics, comparables, and branded reports.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plusJakarta.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
