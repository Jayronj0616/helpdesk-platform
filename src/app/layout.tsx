import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { readDb } from "@/lib/dataverse/store";
import { currentUser } from "@/lib/session";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HelpDesk Platform",
  description: "IT helpdesk and asset tracker built with the same building blocks as the Microsoft Power Platform: tables, apps, flows and dashboards.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();
  const users = readDb().users;
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 font-sans text-slate-900">
        <Nav user={user} users={users} />
        <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
