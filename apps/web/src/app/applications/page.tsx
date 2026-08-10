import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type ApplicationStatus } from "@jobbiq/db";
import { auth } from "@/auth";
import { AppNav } from "@/components/AppNav";
import { isSmtpConfigured } from "@/lib/mailer";
import {
  regenerateEmailAction,
  saveEmailAction,
  sendApplicationAction,
  updateApplicationStatusAction,
} from "./actions";

// Email generation calls the OpenAI API.
export const maxDuration = 300;

const TABS: { key: ApplicationStatus; label: string }[] = [
  { key: "DRAFT", label: "Drafts" },
  { key: "SENT", label: "Sent" },
  { key: "REPLIED", label: "Replied" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "REJECTED", label: "Rejected" },
  { key: "OFFER", label: "Offer" },
];

const NEXT_STATUSES: Record<string, ApplicationStatus[]> = {
  SENT: ["REPLIED", "INTERVIEW", "REJECTED"],
  REPLIED: ["INTERVIEW", "REJECTED"],
  INTERVIEW: ["OFFER", "REJECTED"],
  REJECTED: [],
  OFFER: [],
};

const MESSAGES: Record<string, { kind: "ok" | "err"; text: string }> = {
  sent: { kind: "ok", text: "Application sent." },
  saved: { kind: "ok", text: "Draft saved." },
  generated: { kind: "ok", text: "Email generated — review it below." },
  generate: {
    kind: "err",
    text: "Email generation failed (is OPENAI_API_KEY configured?). You can write the email manually below or hit Regenerate.",
  },
  emptymail: { kind: "err", text: "Subject and body are required." },
  badrecipient: { kind: "err", text: "Enter a valid recipient email address." },
  noemail: { kind: "err", text: "Generate or write the email before sending." },
  send: { kind: "err", text: "Sending failed" },
};

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const params = await searchParams;
  const tab = (
    TABS.some((t) => t.key === params.tab) ? params.tab : "DRAFT"
  ) as ApplicationStatus;

  let message = params.error ? MESSAGES[params.error] : undefined;
  if (!message) {
    const okKey = ["sent", "saved", "generated"].find((k) => params[k]);
    if (okKey) message = MESSAGES[okKey];
  }
  if (params.error === "send" && params.detail) {
    message = { kind: "err", text: `Sending failed: ${params.detail}` };
  }

  const applications = await prisma.application.findMany({
    where: { userId, status: tab },
    orderBy: { updatedAt: "desc" },
    include: {
      jobPosting: {
        select: {
          title: true,
          company: true,
          location: true,
          url: true,
          applyEmail: true,
          applyUrl: true,
        },
      },
      emails: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const smtpReady = isSmtpConfigured();

  return (
    <>
      <AppNav current="applications" />
    <main className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="mb-6 text-2xl font-semibold">Applications</h1>

      {message && (
        <p
          className={`mb-6 rounded-md p-3 text-sm ${
            message.kind === "ok"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      {!smtpReady && tab === "DRAFT" && (
        <p className="mb-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          SMTP is not configured (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
          SMTP_FROM) — drafts can be prepared but not sent.
        </p>
      )}

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-neutral-100 p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/applications?tab=${t.key}`}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm ${
              tab === t.key
                ? "bg-white font-medium shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          {tab === "DRAFT" ? (
            <>
              No drafts. Hit “Apply” on a{" "}
              <Link href="/matches" className="underline">
                match
              </Link>{" "}
              to create one.
            </>
          ) : (
            "Nothing here yet."
          )}
        </div>
      ) : (
        <ul className="space-y-6">
          {applications.map((application) => {
            const email = application.emails[0];
            const job = application.jobPosting;
            return (
              <li
                key={application.id}
                className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline"
                    >
                      {job.title}
                    </a>
                    <p className="text-sm text-neutral-500">
                      {job.company}
                      {job.location ? ` · ${job.location}` : ""}
                      {application.sentAt
                        ? ` · sent ${application.sentAt.toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  {email?.userEdited && (
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                      edited
                    </span>
                  )}
                </div>

                {application.status === "DRAFT" ? (
                  <div className="space-y-4">
                    <form action={saveEmailAction} className="space-y-3">
                      <input
                        type="hidden"
                        name="applicationId"
                        value={application.id}
                      />
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Subject
                        </label>
                        <input
                          name="subject"
                          defaultValue={email?.subject ?? ""}
                          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Email body
                        </label>
                        <textarea
                          name="body"
                          rows={10}
                          defaultValue={email?.body ?? ""}
                          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
                        >
                          Save draft
                        </button>
                      </div>
                    </form>

                    <div className="flex flex-col gap-3 border-t border-neutral-100 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
                      <form action={regenerateEmailAction}>
                        <input
                          type="hidden"
                          name="applicationId"
                          value={application.id}
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100"
                        >
                          {email ? "Regenerate with AI" : "Generate with AI"}
                        </button>
                      </form>

                      <form
                        action={sendApplicationAction}
                        className="flex flex-col gap-2 sm:flex-1 sm:flex-row sm:items-end"
                      >
                        <input
                          type="hidden"
                          name="applicationId"
                          value={application.id}
                        />
                        <div className="flex-1">
                          <label className="mb-1 block text-xs text-neutral-500">
                            Recipient
                          </label>
                          <input
                            name="to"
                            defaultValue={job.applyEmail ?? ""}
                            placeholder="hr@company.com"
                            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!smtpReady || !email}
                          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
                        >
                          Approve & send
                        </button>
                      </form>
                    </div>

                    {job.applyUrl && (
                      <p className="text-xs text-neutral-400">
                        Or apply directly on the portal:{" "}
                        <a
                          href={job.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          {job.applyUrl}
                        </a>
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    {email && (
                      <div className="mb-3 rounded-md bg-neutral-50 p-3 text-sm">
                        <p className="font-medium">{email.subject}</p>
                        <p className="mt-1 whitespace-pre-wrap text-neutral-600">
                          {email.body}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(NEXT_STATUSES[application.status] ?? []).map((next) => (
                        <form key={next} action={updateApplicationStatusAction}>
                          <input type="hidden" name="id" value={application.id} />
                          <input type="hidden" name="status" value={next} />
                          <button
                            type="submit"
                            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
                          >
                            Mark {next.toLowerCase()}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
    </>
  );
}
