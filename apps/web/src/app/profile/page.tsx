import { redirect } from "next/navigation";
import { prisma } from "@jobbiq/db";
import type { EducationItem, ExperienceItem } from "@jobbiq/core";
import { auth } from "@/auth";
import { AppNav } from "@/components/AppNav";
import { SubmitButton } from "@/components/SubmitButton";
import { uploadCvAction, saveProfileAction } from "./actions";

// CV parsing calls the OpenAI API and can take a while.
export const maxDuration = 300;

const MESSAGES: Record<string, { kind: "ok" | "err"; text: string }> = {
  parsed: { kind: "ok", text: "CV parsed — review the extracted profile below." },
  saved: { kind: "ok", text: "Profile saved." },
  nofile: { kind: "err", text: "Choose a CV file first." },
  toolarge: { kind: "err", text: "File too large (max 5 MB)." },
  unsupported: { kind: "err", text: "Unsupported file type — use PDF, DOCX or TXT." },
  empty: { kind: "err", text: "Could not extract text from that file (scanned PDF? OCR is not supported yet)." },
  noname: { kind: "err", text: "Full name is required." },
  parse: {
    kind: "err",
    text: "The CV was uploaded but AI parsing failed. Check that OPENAI_API_KEY is configured, then upload again.",
  },
};

interface LanguageItem {
  language: string;
  level: string | null;
}
interface LinkItem {
  label: string;
  url: string;
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const params = await searchParams;
  const messageKey = params.error ?? (params.parsed ? "parsed" : params.saved ? "saved" : "");
  const message = MESSAGES[messageKey];

  const [profile, latestCv] = await Promise.all([
    prisma.candidateProfile.findUnique({ where: { userId } }),
    prisma.cvDocument.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const skills = (profile?.skills ?? []) as string[];
  const certifications = (profile?.certifications ?? []) as string[];
  const languages = (profile?.languages ?? []) as unknown as LanguageItem[];
  const links = (profile?.links ?? []) as unknown as LinkItem[];
  const experience = (profile?.experience ?? []) as unknown as ExperienceItem[];
  const education = (profile?.education ?? []) as unknown as EducationItem[];

  return (
    <>
      <AppNav current="profile" />
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="mb-6 text-2xl font-semibold">Candidate profile</h1>

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

      <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-medium">CV</h2>
        <p className="mb-4 text-sm text-neutral-500">
          {latestCv
            ? `Last upload: ${latestCv.fileName} (${latestCv.createdAt.toLocaleDateString()})${latestCv.parsedAt ? "" : " — not parsed yet"}`
            : "Upload your CV (PDF, DOCX or TXT). We extract your profile from it automatically."}
        </p>
        <form
          action={uploadCvAction}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input
            type="file"
            name="cv"
            accept=".pdf,.docx,.txt,.md,application/pdf"
            required
            className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-stone-200 file:px-3 file:py-2 file:text-sm file:font-medium"
          />
          <SubmitButton pendingLabel="Uploading & parsing CV…">
            Upload & parse
          </SubmitButton>
        </form>
      </section>

      {profile && (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium">
            Extracted profile{" "}
            {profile.editedByUser && (
              <span className="ml-1 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                edited
              </span>
            )}
          </h2>
          <form action={saveProfileAction} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Full name" name="fullName" defaultValue={profile.fullName} required />
              <Field label="Headline" name="headline" defaultValue={profile.headline ?? ""} />
              <Field label="Email" name="email" defaultValue={profile.email ?? ""} />
              <Field label="Phone" name="phone" defaultValue={profile.phone ?? ""} />
              <Field label="Location" name="location" defaultValue={profile.location ?? ""} />
            </div>
            <TextArea
              label="Summary"
              name="summary"
              rows={3}
              defaultValue={profile.summary ?? ""}
            />
            <TextArea
              label="Skills (comma-separated)"
              name="skills"
              rows={2}
              defaultValue={skills.join(", ")}
            />
            <TextArea
              label="Certifications (comma-separated)"
              name="certifications"
              rows={2}
              defaultValue={certifications.join(", ")}
            />
            <TextArea
              label="Languages (one per line, e.g. English - C1)"
              name="languages"
              rows={3}
              defaultValue={languages
                .map((l) => (l.level ? `${l.language} - ${l.level}` : l.language))
                .join("\n")}
            />
            <TextArea
              label="Links (one per line, e.g. GitHub | https://github.com/me)"
              name="links"
              rows={3}
              defaultValue={links.map((l) => `${l.label} | ${l.url}`).join("\n")}
            />
            <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
          </form>

          {experience.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Experience (from CV)
              </h3>
              <ul className="space-y-3">
                {experience.map((item, index) => (
                  <li key={index} className="rounded-lg border border-neutral-200 p-3 text-sm">
                    <p className="font-medium">
                      {item.title} · {item.company}
                    </p>
                    <p className="text-neutral-500">
                      {item.startDate ?? "?"} – {item.endDate ?? "present"}
                    </p>
                    {item.description && (
                      <p className="mt-1 text-neutral-600">{item.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {education.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Education (from CV)
              </h3>
              <ul className="space-y-3">
                {education.map((item, index) => (
                  <li key={index} className="rounded-lg border border-neutral-200 p-3 text-sm">
                    <p className="font-medium">{item.school}</p>
                    <p className="text-neutral-500">
                      {[item.degree, item.field].filter(Boolean).join(", ")}{" "}
                      {item.startYear || item.endYear
                        ? `(${item.startYear ?? "?"} – ${item.endYear ?? "?"})`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
    </>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  rows,
}: {
  label: string;
  name: string;
  defaultValue: string;
  rows: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
