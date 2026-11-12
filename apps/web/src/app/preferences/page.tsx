import { redirect } from "next/navigation";
import { prisma, type SearchPreference } from "@jobbiq/db";
import { connectorRegistry } from "@jobbiq/connectors";
import {
  COUNTRY_LABELS,
  SUPPORTED_COUNTRIES,
  effectiveCountries,
} from "@jobbiq/core";
import { auth } from "@/auth";
import { AppNav } from "@/components/AppNav";
import { SubmitButton } from "@/components/SubmitButton";
import {
  savePreferenceAction,
  deletePreferenceAction,
  runCrawlNowAction,
} from "./actions";

// Manual crawl runs connectors inline.
export const maxDuration = 300;

const FREQUENCY_LABELS: Record<string, string> = {
  HOURLY: "Hourly",
  EVERY_6_HOURS: "Every 6 hours",
  DAILY: "Daily",
  WEEKLY: "Weekly",
};

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const params = await searchParams;
  const preferences = await prisma.searchPreference.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  const sourceOptions = [...connectorRegistry.values()].map((s) => ({
    key: s.key,
    name: s.name,
    countries: s.countries ?? null,
    localOnly: !!s.heavy,
  }));

  let message: { kind: "ok" | "err"; text: string } | undefined;
  if (params.saved) message = { kind: "ok", text: "Preference saved." };
  else if (params.deleted) message = { kind: "ok", text: "Preference deleted." };
  else if (params.crawled !== undefined)
    message = {
      kind: "ok",
      text: `Crawl finished — ${params.crawled} postings fetched. See the job feed.`,
    };
  else if (params.error === "required")
    message = { kind: "err", text: "Name and at least one keyword are required." };
  else if (params.error === "nosource")
    message = { kind: "err", text: "Select at least one job source." };
  else if (params.error === "nocountry")
    message = { kind: "err", text: "Select at least one country." };
  else if (params.error === "crawl")
    message = {
      kind: "err",
      text: `Crawl failed: ${params.detail ?? "unknown error"}`,
    };

  return (
    <>
      <AppNav current="preferences" />
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="mb-6 text-2xl font-semibold">Search preferences</h1>

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

      {preferences.map((preference) => (
        <section
          key={preference.id}
          className="mb-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">
              {preference.name}{" "}
              {!preference.active && (
                <span className="ml-1 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                  paused
                </span>
              )}
            </h2>
            <div className="flex flex-wrap gap-2">
              <form action={runCrawlNowAction}>
                <input type="hidden" name="id" value={preference.id} />
                <SubmitButton variant="secondary" pendingLabel="Crawling…">
                  Run crawl now
                </SubmitButton>
              </form>
              <form action={deletePreferenceAction}>
                <input type="hidden" name="id" value={preference.id} />
                <SubmitButton variant="danger" pendingLabel="Deleting…">
                  Delete
                </SubmitButton>
              </form>
            </div>
          </div>
          <p className="mb-4 text-xs text-neutral-400">
            {preference.lastCrawledAt
              ? `Last crawled ${preference.lastCrawledAt.toLocaleString()}`
              : "Not crawled yet"}{" "}
            · {FREQUENCY_LABELS[preference.frequency]}
          </p>
          <PreferenceForm
            preference={preference}
            sourceOptions={sourceOptions}
          />
        </section>
      ))}

      <section className="rounded-xl border border-dashed border-neutral-300 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">New preference</h2>
        <PreferenceForm
          sourceOptions={sourceOptions}
        />
      </section>
    </main>
    </>
  );
}

function PreferenceForm({
  preference,
  sourceOptions,
}: {
  preference?: SearchPreference;
  sourceOptions: {
    key: string;
    name: string;
    countries: string[] | null;
    localOnly: boolean;
  }[];
}) {
  const selectedCountries = effectiveCountries(preference?.countries ?? []);
  return (
    <form action={savePreferenceAction} className="space-y-4">
      {preference && <input type="hidden" name="id" value={preference.id} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Name"
          name="name"
          defaultValue={preference?.name ?? ""}
          placeholder="e.g. Senior TS remote"
          required
        />
        <Field
          label="Keywords (comma-separated)"
          name="keywords"
          defaultValue={preference?.keywords.join(", ") ?? ""}
          placeholder="typescript, react"
          required
        />
        <Field
          label="Locations (comma-separated)"
          name="locations"
          defaultValue={preference?.locations.join(", ") ?? ""}
          placeholder="Bratislava, Prague"
        />
        <div>
          <label className="mb-1 block text-sm font-medium">Remote</label>
          <select
            name="remoteType"
            defaultValue={preference?.remoteType ?? "ANY"}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="ANY">Any</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ON_SITE">On-site</option>
          </select>
        </div>
        <Field
          label="Seniority (comma-separated)"
          name="seniority"
          defaultValue={preference?.seniority.join(", ") ?? ""}
          placeholder="senior, lead"
        />
        <Field
          label="Contract types (comma-separated)"
          name="contractTypes"
          defaultValue={preference?.contractTypes.join(", ") ?? ""}
          placeholder="full-time, contract"
        />
        <Field
          label="Min. salary (yearly)"
          name="salaryMin"
          type="number"
          defaultValue={preference?.salaryMin?.toString() ?? ""}
          placeholder="50000"
        />
        <Field
          label="Currency"
          name="currency"
          defaultValue={preference?.currency ?? "EUR"}
        />
        <Field
          label="Exclude companies (comma-separated)"
          name="excludeCompanies"
          defaultValue={preference?.excludeCompanies.join(", ") ?? ""}
        />
        <div>
          <label className="mb-1 block text-sm font-medium">Check frequency</label>
          <select
            name="frequency"
            defaultValue={preference?.frequency ?? "DAILY"}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="HOURLY">Hourly</option>
            <option value="EVERY_6_HOURS">Every 6 hours</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
          </select>
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Countries</p>
        <div className="flex flex-wrap gap-4">
          {SUPPORTED_COUNTRIES.map((country) => (
            <label key={country} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="countries"
                value={country}
                defaultChecked={selectedCountries.includes(country)}
              />
              {COUNTRY_LABELS[country]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Job sources</p>
        <p className="mb-2 text-xs text-neutral-500">
          Each source only runs for the selected countries it covers. Sources
          marked “local” run only with the local crawler (<code>pnpm crawl</code>).
        </p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {sourceOptions.map((source) => (
            <label key={source.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="sources"
                value={source.key}
                defaultChecked={
                  preference ? preference.sources.includes(source.key) : true
                }
              />
              <span>
                {source.name}{" "}
                <span className="text-xs uppercase text-neutral-400">
                  {source.countries ? source.countries.join(" ") : "remote/intl"}
                </span>
                {source.localOnly && (
                  <span
                    className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500"
                    title="Runs only with the local crawler (pnpm crawl), not on Vercel"
                  >
                    local
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={preference?.active ?? true}
          />
          Active (crawled automatically)
        </label>
        <SubmitButton pendingLabel="Saving…" className="w-full sm:w-auto">
          {preference ? "Save changes" : "Create preference"}
        </SubmitButton>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
