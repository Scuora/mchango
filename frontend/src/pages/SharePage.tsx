import { Check, Copy, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoadState, SaveError } from "@/components/LoadState";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, RadioGroup, Textarea } from "@/components/ui/form";
import { DateField } from "@/components/ui/pickers";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui/misc";
import { api, useResource } from "@/lib/api";
import { daysAgoNairobi } from "@/lib/time";
import type { Account, ChallengeSummary, PublicPreview, StatementReport } from "@/lib/types";
import { buildAccountsUpdate, buildWhatsAppUpdate, type Range } from "@/lib/whatsapp";

type RangeChoice = "all" | "week" | "since";
type Scope = "together" | "accounts";

/**
 * Writes a WhatsApp update from public fields only: public names, amounts and totals.
 * For the whole fundraiser at once, or account by account (each kitty on its own,
 * then a summary that adds them up).
 */
export function SharePage() {
  const preview = useResource<PublicPreview>("/api/manage/public-preview");
  const accounts = useResource<Account[]>("/api/manage/accounts");
  const challenges = useResource<ChallengeSummary[]>("/api/manage/challenges");
  const [scope, setScope] = useState<Scope>("together");
  const [chosen, setChosen] = useState<number[]>([]);
  // Each chosen account's statement for all time, by account id; the range picks what is listed.
  const [statements, setStatements] = useState<Map<number, StatementReport>>(new Map());
  const [statementError, setStatementError] = useState<unknown>(null);
  const [range, setRange] = useState<RangeChoice>("all");
  const [since, setSince] = useState(daysAgoNairobi(14));
  const [includeSpending, setIncludeSpending] = useState(true);
  const [includeTotals, setIncludeTotals] = useState(true);
  const [includeLink, setIncludeLink] = useState(true);
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const data = preview.data;
  const effectiveRange: Range = range === "all" ? { kind: "all" } : { kind: "since", date: range === "week" ? daysAgoNairobi(7) : since };
  const accountList = accounts.data ?? [];
  // In the accounts list's order, whatever order they were ticked in.
  const picked = accountList.filter((a) => chosen.includes(a.id));
  const byAccount = scope === "accounts";

  useEffect(() => {
    if (!byAccount) return;
    const missing = picked.filter((a) => !statements.has(a.id));
    if (missing.length === 0) return;
    let cancelled = false;
    setStatementError(null);
    Promise.all(missing.map((a) => api.get<StatementReport>(`/api/manage/reports/statement?account_id=${a.id}`)))
      .then((reports) => {
        if (cancelled) return;
        setStatements((current) => {
          const next = new Map(current);
          reports.forEach((r, i) => next.set(missing[i].id, r));
          return next;
        });
      })
      .catch((e) => !cancelled && setStatementError(e));
    return () => {
      cancelled = true;
    };
  }, [byAccount, chosen, accounts.data, statements]);

  const ready = picked.length > 0 && picked.every((a) => statements.has(a.id));

  useEffect(() => {
    if (!data || edited) return;
    const options = { range: effectiveRange, includeSpending, includeTotals, link: includeLink ? data.public_url : null };
    if (!byAccount) {
      setText(buildWhatsAppUpdate(data.page, options));
    } else if (ready) {
      const allAccounts = accountList.length > 0 && picked.length === accountList.length;
      setText(buildAccountsUpdate(data.page, picked.map((a) => statements.get(a.id)!), { ...options, allAccounts }));
    } else {
      setText("");
    }
  }, [data, range, since, includeSpending, includeTotals, includeLink, edited, byAccount, chosen, ready, statements]);

  const kittyOf = (id: number) => (challenges.data ?? []).find((c) => c.account_id === id)?.name;
  const toggle = (id: number, on: boolean) => {
    setChosen((current) => (on ? [...current, id] : current.filter((c) => c !== id)));
    setEdited(false);
  };

  if (!data) return <LoadState loading={preview.loading} error={preview.error} onRetry={preview.reload} />;

  async function copy() {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok && textarea.current) {
      // Works without HTTPS (e.g. management over a private network).
      textarea.current.focus();
      textarea.current.select();
      ok = document.execCommand("copy");
    }
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="page-title">Share on WhatsApp</h1>
      <Notice tone="info">
        Only public information is used: public names (or the anonymous label), amounts and totals. M-Pesa names and phone numbers are never included.
      </Notice>
      {!data.published && data.public_url && (
        <Notice tone="warning">The public page is not published yet, so the link will not work until you publish it in Settings.</Notice>
      )}

      <Card>
        <CardHeader title="What to include" />
        <CardBody className="space-y-4">
          <RadioGroup<Scope>
            name="scope"
            legend="Accounts"
            value={scope}
            onChange={(v) => {
              setScope(v);
              setEdited(false);
            }}
            options={[
              { value: "together", label: "All accounts together" },
              { value: "accounts", label: "Account by account" },
            ]}
          />
          {byAccount && (
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-stone-800">Accounts to report</legend>
              <p className="mb-1 text-sm text-stone-600">
                Each account gets its own list and what it holds. With more than one, a summary adds them up. The goal is shown when every account is ticked.
              </p>
              {!accounts.data && <LoadState loading={accounts.loading} error={accounts.error} onRetry={accounts.reload} label="Loading accounts" />}
              {accountList.map((a) => {
                const kitty = kittyOf(a.id);
                return (
                  <Checkbox
                    key={a.id}
                    checked={chosen.includes(a.id)}
                    onChange={(e) => toggle(a.id, e.target.checked)}
                    label={a.name}
                    hint={kitty ? `Challenge: ${kitty}` : undefined}
                  />
                );
              })}
              {accountList.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setChosen(picked.length === accountList.length ? [] : accountList.map((a) => a.id));
                    setEdited(false);
                  }}
                >
                  {picked.length === accountList.length ? "Clear all" : "Tick all"}
                </Button>
              )}
              <SaveError error={statementError} />
            </fieldset>
          )}
          <RadioGroup<RangeChoice>
            name="range"
            legend="Contributions"
            value={range}
            onChange={(v) => {
              setRange(v);
              setEdited(false);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "week", label: "Last 7 days" },
              { value: "since", label: "Since a date" },
            ]}
          />
          {range === "since" && (
            <Field label="Since" htmlFor="share-since">
              <DateField id="share-since" value={since} onChange={(v) => (setSince(v), setEdited(false))} className="max-w-xs" />
            </Field>
          )}
          <div>
            <Checkbox checked={includeTotals} onChange={(e) => (setIncludeTotals(e.target.checked), setEdited(false))} label="Totals, balance and target progress" />
            <Checkbox checked={includeSpending} onChange={(e) => (setIncludeSpending(e.target.checked), setEdited(false))} label="Breakdown of expenses" hint="Each expense and its amount, the transaction costs, and the total spent" />
            {data.public_url ? (
              <Checkbox checked={includeLink} onChange={(e) => (setIncludeLink(e.target.checked), setEdited(false))} label={`Link to the public page (${data.public_url})`} />
            ) : (
              <p className="py-2 text-sm text-stone-600">Set PUBLIC_URL on the server to include a link to the public page.</p>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Message"
          description="You can edit the text before copying."
          actions={
            edited && (
              <Button variant="ghost" size="sm" onClick={() => setEdited(false)}>
                Undo my edits
              </Button>
            )
          }
        />
        <CardBody className="space-y-3">
          {byAccount && picked.length === 0 && <Notice tone="info">Tick at least one account above.</Notice>}
          {byAccount && picked.length > 0 && !ready && !statementError && <p className="text-sm text-stone-600">Adding up the accounts…</p>}
          <Textarea
            ref={textarea}
            aria-label="WhatsApp message"
            rows={16}
            className="font-mono text-sm"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setEdited(true);
            }}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={() => void copy()} icon={copied ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-5 font-medium text-stone-900 no-underline hover:bg-stone-50 hover:no-underline"
            >
              <MessageCircle className="size-5" aria-hidden /> Open WhatsApp
            </a>
          </div>
          <p className="sr-only" aria-live="polite">
            {copied ? "Message copied" : ""}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
