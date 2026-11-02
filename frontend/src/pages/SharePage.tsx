import { Check, Copy, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoadState } from "@/components/LoadState";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, RadioGroup, Textarea } from "@/components/ui/form";
import { DateField } from "@/components/ui/pickers";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui/misc";
import { useResource } from "@/lib/api";
import { daysAgoNairobi } from "@/lib/time";
import type { PublicPreview } from "@/lib/types";
import { buildWhatsAppUpdate, type Range } from "@/lib/whatsapp";

type RangeChoice = "all" | "week" | "since";

/** Writes a WhatsApp update from the public page's fields only. */
export function SharePage() {
  const preview = useResource<PublicPreview>("/api/manage/public-preview");
  const [range, setRange] = useState<RangeChoice>("all");
  const [since, setSince] = useState(daysAgoNairobi(14));
  const [includeSpending, setIncludeSpending] = useState(false);
  const [includeTotals, setIncludeTotals] = useState(true);
  const [includeLink, setIncludeLink] = useState(true);
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const data = preview.data;
  const effectiveRange: Range = range === "all" ? { kind: "all" } : { kind: "since", date: range === "week" ? daysAgoNairobi(7) : since };

  useEffect(() => {
    if (!data || edited) return;
    setText(
      buildWhatsAppUpdate(data.page, {
        range: effectiveRange,
        includeSpending,
        includeTotals,
        link: includeLink ? data.public_url : null,
      }),
    );
  }, [data, range, since, includeSpending, includeTotals, includeLink, edited]);

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
            <Checkbox checked={includeSpending} onChange={(e) => (setIncludeSpending(e.target.checked), setEdited(false))} label="Spending list" />
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
