import { FileUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { LoadState, SaveError } from "@/components/LoadState";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Choice } from "@/components/ui/pickers";
import { Badge, Card, CardBody, CardHeader, EmptyState, Notice, type Tone } from "@/components/ui/misc";
import { api, fieldError, useResource } from "@/lib/api";
import { IMPORT_STATUS_LABELS } from "@/lib/labels";
import { formatNairobi, formatNairobiDate } from "@/lib/time";
import type { Account, ImportStatus, ImportSummary } from "@/lib/types";

export const STATUS_TONES: Record<ImportStatus, Tone> = {
  queued: "info",
  processing: "info",
  ready: "success",
  failed: "danger",
  discarded: "neutral",
};

export function StatementsPage() {
  const imports = useResource<ImportSummary[]>("/api/manage/statements");
  const accounts = useResource<Account[]>("/api/manage/accounts");
  const navigate = useNavigate();
  const mpesa = accounts.data?.filter((a) => a.kind === "mpesa") ?? [];
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const chosenAccount = accountId || (mpesa[0] ? String(mpesa[0].id) : "");

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || !chosenAccount) return;
    const form = new FormData();
    form.append("account_id", chosenAccount);
    if (password) form.append("password", password);
    form.append("file", file);
    setBusy(true);
    setError(null);
    try {
      const created = await api.upload<ImportSummary>("/api/manage/statements", form);
      navigate(`/manage/statements/${created.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="page-title">Statements</h1>

      <Card>
        <CardHeader title="Upload statement" description="An M-Pesa statement PDF. Rows are matched to your records; nothing is added without your confirmation." />
        <form onSubmit={upload}>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Account" htmlFor="st-account" error={fieldError(error, "account_id")}>
              <Choice
                id="st-account"
                value={chosenAccount}
                options={mpesa.map((a) => ({ value: String(a.id), label: a.number_hint ? `${a.name} (…${a.number_hint})` : a.name }))}
                placeholder={mpesa.length === 0 ? "No M-Pesa account set up" : "Choose…"}
                onChange={setAccountId}
              />
            </Field>
            <Field
              label="Statement password"
              htmlFor="st-password"
              optional
              hint="From the M-Pesa SMS sent with the statement. Used once to open the file and never stored."
            >
              <Input id="st-password" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Statement PDF" htmlFor="st-file" className="sm:col-span-2" error={fieldError(error, "file")} hint="Up to 10 MB.">
              <input
                id="st-file"
                type="file"
                accept="application/pdf,.pdf"
                className="block min-h-11 w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:font-medium"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <div className="space-y-3 sm:col-span-2">
              {error !== null && !fieldError(error, "file") && !fieldError(error, "account_id") ? <SaveError error={error} /> : null}
              <Button type="submit" size="lg" busy={busy} disabled={!file || !chosenAccount} icon={<FileUp className="size-5" aria-hidden />}>
                Upload statement
              </Button>
            </div>
          </CardBody>
        </form>
      </Card>

      <Card>
        <CardHeader title="Uploaded statements" />
        {!imports.data ? (
          <div className="px-4">
            <LoadState loading={imports.loading} error={imports.error} onRetry={imports.reload} />
          </div>
        ) : imports.data.length === 0 ? (
          <EmptyState title="No statements yet">Upload a statement to check your records against it.</EmptyState>
        ) : (
          <ul className="stagger divide-y divide-stone-100">
            {imports.data.map((i) => (
              <li key={i.id}>
                <Link
                  to={`/manage/statements/${i.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-stone-900 no-underline hover:bg-stone-50 hover:no-underline sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {i.period_start ? `${formatNairobiDate(i.period_start)} – ${formatNairobiDate(i.period_end)}` : (i.original_name ?? `Import #${i.id}`)}
                    </p>
                    <p className="text-sm text-stone-600">
                      {i.account_name} · uploaded {formatNairobi(i.created_at)}
                      {i.status === "ready" && ` · ${i.row_count} rows`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {i.status === "ready" && i.unresolved_count > 0 && <Badge tone="warning">{i.unresolved_count} to resolve</Badge>}
                    {i.status === "ready" && i.completed_at && <Badge tone="success">Completed</Badge>}
                    <Badge tone={STATUS_TONES[i.status]}>{IMPORT_STATUS_LABELS[i.status]}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Notice tone="info">
        A matching file only shows it is the same file as before, not that a statement is genuine. Uploading the same file twice is refused; overlapping
        statements are fine and never create duplicate records.
      </Notice>
    </div>
  );
}
