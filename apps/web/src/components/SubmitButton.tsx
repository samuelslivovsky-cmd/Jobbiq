"use client";

import { useFormStatus } from "react-dom";

const VARIANTS = {
  primary: "bg-stone-900 text-white hover:bg-stone-700",
  secondary: "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100",
  danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
} as const;

/**
 * Submit button with built-in loading feedback: while the enclosing form's
 * server action is running it disables itself, shows a spinner and swaps to
 * pendingLabel. Must be rendered inside a <form>.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof VARIANTS;
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
    >
      {pending && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
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
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
