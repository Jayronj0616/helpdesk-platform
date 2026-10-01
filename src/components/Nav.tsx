import Link from "next/link";
import type { User } from "@/lib/dataverse/types";
import { PersonaSwitcher } from "./PersonaSwitcher";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/tickets", label: "Tickets" },
  { href: "/assets", label: "Assets" },
  { href: "/requests", label: "Asset requests" },
  { href: "/flows", label: "Flow runs" },
];

export function Nav({ user, users }: { user: User; users: User[] }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold text-indigo-700">HelpDesk Platform</Link>
        <nav className="flex flex-wrap gap-4 text-sm text-slate-600">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-indigo-700">{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto">
          <PersonaSwitcher current={user} users={users} />
        </div>
      </div>
    </header>
  );
}
