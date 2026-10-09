import Link from "next/link";
import type { User } from "@/lib/dataverse/types";
import { logout } from "@/app/auth-actions";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/tickets", label: "Tickets" },
  { href: "/assets", label: "Assets" },
  { href: "/requests", label: "Asset requests" },
  { href: "/flows", label: "Flow runs" },
];

export function Nav({ user }: { user: User | null }) {
  const staff = user?.role === "agent" || user?.role === "manager";
  const links = [
    ...LINKS,
    ...(staff ? [{ href: "/reports", label: "Reports" }] : []),
    ...(user?.role === "manager" ? [{ href: "/admin/users", label: "Users" }, { href: "/admin/categories", label: "Categories" }] : []),
  ];
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold text-indigo-700">HelpDesk Platform</Link>
        {user && (
          <>
            <nav className="flex flex-wrap gap-4 text-sm text-slate-600">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="hover:text-indigo-700">{l.label}</Link>
              ))}
            </nav>
            <form action={logout} className="ml-auto flex items-center gap-3 text-sm">
              <Link href="/account" className="text-slate-600 hover:text-indigo-700">{user.name} <span className="text-slate-500">({user.role})</span></Link>
              <button className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">Sign out</button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}
