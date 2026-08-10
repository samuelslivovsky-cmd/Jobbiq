import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { TabLink } from "@/components/TabLink";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard" },
  { href: "/profile", label: "Profile", key: "profile" },
  { href: "/preferences", label: "Preferences", key: "preferences" },
  { href: "/jobs", label: "Jobs", key: "jobs" },
  { href: "/matches", label: "Matches", key: "matches" },
  { href: "/applications", label: "Applications", key: "applications" },
];

export function AppNav({ current }: { current: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 pt-3 md:px-8">
        <Link
          href="/dashboard"
          className="text-lg font-extrabold tracking-tight text-stone-900"
        >
          Jobbiq<span className="text-emerald-600">.</span>
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md px-2 py-1 text-sm text-stone-500 hover:text-stone-900"
          >
            Sign out
          </button>
        </form>
      </div>
      <nav className="mx-auto max-w-4xl overflow-x-auto px-3 md:px-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-1 py-2">
          {LINKS.map((link) => (
            <TabLink
              key={link.key}
              href={link.href}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                current === link.key
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-900"
              }`}
            >
              {link.label}
            </TabLink>
          ))}
        </div>
      </nav>
    </header>
  );
}
