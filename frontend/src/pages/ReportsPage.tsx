import { Check, Copy, Download, ExternalLink, FileSpreadsheet, FileText, Share2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { SaveError } from "@/components/LoadState";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, RadioGroup } from "@/components/ui/form";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui/misc";
import { Choice, DateField } from "@/components/ui/pickers";
import { api, useResource } from "@/lib/api";
import { formatKes } from "@/lib/money";
import { todayNairobi } from "@/lib/time";
import type { Account, ChallengeSummary, StatementReport } from "@/lib/types";
import { buildStatementCsv } from "@/features/statementCsv";
import type { ReportKind } from "@/features/statementPdf";
import { buildStatementText } from "@/features/statementText";
import { copyText } from "@/public/share";

interface Created {
  file: File;
  url: string;
  report: StatementReport;
  /** The same statement as WhatsApp-ready text, for people who cannot open a PDF. */
  text: string;
  /** The same statement as a spreadsheet. */
  csv: { name: string; url: string };
}

const ALL = "all";

async function photoDataUrl(): Promise<string | null> {
  const response = await fetch("/api/public/memorial-photo", { credentials: "same-origin" });
  if (!response.ok || !response.headers.get("content-type")?.includes("jpeg")) return null;
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Statements of account as PDFs, text and spreadsheets, for sending to
 * stakeholders: for the whole fundraiser or for one account (a kitty, such as
 * a challenge's own M-Pesa line). `?account=3` starts with that account.
 */
export function ReportsPage() {
  const [search] = useSearchParams();
  const accounts = useResource<Account[]>("/api/manage/accounts");
  const challenges = useResource<ChallengeSummary[]>("/api/manage/challenges");
  const [account, setAccount] = useState(search.get("account") ?? ALL);
  const [kind, setKind] = useState<ReportKind>("full");
  const [period, setPeriod] = useState<"all" | "range">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayNairobi());
  const [names, setNames] = useState<"public" | "mpesa">("public");
  const [includeCodes, setIncludeCodes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!created) return;
    setCopied(await copyText(created.text));
  }

  useEffect(() => () => {
    if (created) {
      URL.revokeObjectURL(created.url);
      URL.revokeObjectURL(created.csv.url);
    }
  }, [created]);

  const kittyOf = (id: number) => (challenges.data ?? []).find((c) => c.account_id === id)?.name;
  const accountOptions = [
    { value: ALL, label: "All accounts (the whole fundraiser)" },
    ...(accounts.data ?? []).map((a) => {
      const kitty = kittyOf(a.id);
      return { value: String(a.id), label: kitty ? `${a.name} · ${kitty}` : a.name };
    }),
  ];

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (period === "range" && from) params.set("from", from);
      if (period === "range" && to) params.set("to", to);
      if (account !== ALL) params.set("account_id", account);
      const report = await api.get<StatementReport>(`/api/manage/reports/statement?${params}`);
      const [{ buildStatementPdf, statementFileName, loadPdfFonts }, photo] = await Promise.all([
        import("@/features/statementPdf"),
        report.fundraiser.has_photo ? photoDataUrl() : Promise.resolve(null),
      ]);
      const blob = buildStatementPdf(report, { kind, names, includeCodes, photo, fonts: await loadPdfFonts() });
      const file = new File([blob], statementFileName(report, kind), { type: "application/pdf" });
      const text = buildStatementText(report, { kind, names, includeCodes });
      const sheet = new Blob([buildStatementCsv(report, { kind, names, includeCodes })], { type: "text/csv;charset=utf-8" });
      const csv = { name: statementFileName(report, kind, "csv"), url: URL.createObjectURL(sheet) };
      setCreated({ file, url: URL.createObjectURL(file), report, text, csv });
      setCopied(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!created) return;
    try {
      await navigator.share({ files: [created.file], title: created.file.name, text: created.text });
    } catch {
      // Cancelled or not supported; the download button still works.
    }
  }

  const canShare = Boolean(created && navigator.canShare?.({ files: [created.file] }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="mt-1 text-stone-600">
          Statements of account as a PDF, as WhatsApp-ready text and as a spreadsheet, for the whole fundraiser or one account, to send to the family, the church or
          any other group.
        </p>
      </div>
      <form onSubmit={create} noValidate>
        <Card>
          <CardHeader title="Create a statement" />
          <CardBody className="space-y-5">
            <Field
              label="Account"
              htmlFor="rep-account"
              hint="One account gives that kitty's own statement: what came in, what was spent or handed over, and what it still holds."
            >
              <Choice id="rep-account" value={account} options={accountOptions} onChange={(v) => setAccount(v || ALL)} />
            </Field>
            <RadioGroup<ReportKind>
              name="kind"
              legend="What to include"
              value={kind}
              onChange={setKind}
              options={[
                { value: "full", label: "Full account (money in and out)" },
                { value: "received", label: "Contributions received" },
                { value: "spent", label: "Expenses (money spent)" },
              ]}
            />
            <RadioGroup<"all" | "range">
              name="period"
              legend="Period"
              value={period}
              onChange={setPeriod}
              options={[
                { value: "all", label: "Everything to date" },
                { value: "range", label: "Between two dates" },
              ]}
            />
            {period === "range" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="From" htmlFor="rep-from" hint="Leave empty to start from the beginning.">
                  <DateField id="rep-from" value={from} onChange={setFrom} />
                </Field>
                <Field label="To" htmlFor="rep-to">
                  <DateField id="rep-to" value={to} onChange={setTo} />
                </Field>
              </div>
            )}
            <RadioGroup<"public" | "mpesa">
              name="names"
              legend="Names"
              value={names}
              onChange={setNames}
              options={[
                { value: "public", label: "Public names (safe to share widely)" },
                { value: "mpesa", label: "M-Pesa names (family committee only)" },
              ]}
            />
            <Checkbox
              checked={includeCodes}
              onChange={(e) => setIncludeCodes(e.target.checked)}
              label="Include M-Pesa codes"
              hint="Useful for the committee or an auditor to trace each entry. Leave off for wider sharing."
            />
            {(names === "mpesa" || includeCodes) && (
              <Notice tone="warning">This statement contains details that are not on the public page. Send it only to the people who need it.</Notice>
            )}
            <p className="text-sm text-stone-600">Phone numbers and personal transactions are never included.</p>
            <SaveError error={error} />
            <Button type="submit" busy={busy} icon={<FileText className="size-4" aria-hidden />}>
              Create statement
            </Button>
          </CardBody>
        </Card>
      </form>

      {created && (
        <Card>
          <CardHeader
            title="Your statement is ready"
            description={`${created.file.name} · ${created.report.account ? `left in ${created.report.account.name}` : "funds remaining"} ${formatKes(created.report.closing_minor)}`}
          />
          <CardBody className="flex flex-wrap gap-3">
            <a
              href={created.url}
              download={created.file.name}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-plum-700 px-4 font-medium text-white no-underline hover:bg-plum-800 hover:no-underline"
            >
              <Download className="size-4" aria-hidden /> Download PDF
            </a>
            {canShare && (
              <Button variant="secondary" icon={<Share2 className="size-4" aria-hidden />} onClick={() => void share()}>
                Share PDF with text
              </Button>
            )}
            <Button variant="secondary" icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} onClick={() => void copy()}>
              {copied ? "Copied" : "Copy for WhatsApp"}
            </Button>
            <a
              href={created.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 font-medium text-stone-900 no-underline hover:bg-stone-50 hover:no-underline"
            >
              <ExternalLink className="size-4" aria-hidden /> Open
            </a>
            <a
              href={created.csv.url}
              download={created.csv.name}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 font-medium text-stone-900 no-underline hover:bg-stone-50 hover:no-underline"
            >
              <FileSpreadsheet className="size-4" aria-hidden /> Download spreadsheet
            </a>
          </CardBody>
          <CardBody className="border-t border-stone-100">
            <p className="mb-2 text-sm font-medium text-stone-800">The same statement as text</p>
            <p className="mb-3 text-sm text-stone-600">For anyone who cannot open a PDF: paste it into WhatsApp as a message, before or after sending the PDF.</p>
            <textarea
              readOnly
              value={created.text}
              rows={12}
              aria-label="Statement as text"
              className="w-full rounded-lg border border-stone-300 bg-stone-50 p-3 font-mono text-[13px] leading-relaxed text-stone-800"
              onFocus={(e) => e.currentTarget.select()}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
