import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { registerAction } from "@/app/actions";

const ERRORS: Record<string, string> = {
  invalid: "Enter a valid email and a password of at least 8 characters.",
  exists: "An account with this email already exists.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold">Create account</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Start automating your job search
        </p>
        {error && (
          <p className="mb-4 rounded-md bg-red-50 p-2 text-sm text-red-700">
            {ERRORS[error] ?? "Something went wrong."}
          </p>
        )}
        <form action={registerAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              name="name"
              type="text"
              autoComplete="name"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <SubmitButton pendingLabel="Creating account…" className="w-full">
            Create account
          </SubmitButton>
        </form>
        <p className="mt-4 text-sm text-neutral-500">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-neutral-900 underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
