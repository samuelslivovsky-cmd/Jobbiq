"use client";

import Link, { useLinkStatus } from "next/link";

function PendingWrapper({
  block,
  children,
}: {
  block?: boolean;
  children: React.ReactNode;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`${
        block ? "flex w-full flex-col" : "inline-flex items-center justify-center gap-1.5"
      } transition-opacity ${pending ? "opacity-50" : ""}`}
    >
      {children}
      {pending && !block && (
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-90"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
    </span>
  );
}

/**
 * Link with navigation feedback: instant press feedback (scale) and a
 * pending state (dimmed + spinner) while the next page is loading.
 */
export function TabLink({
  href,
  className = "",
  block,
  children,
}: {
  href: string;
  className?: string;
  block?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`transition active:scale-[0.97] ${className}`}>
      <PendingWrapper block={block}>{children}</PendingWrapper>
    </Link>
  );
}
