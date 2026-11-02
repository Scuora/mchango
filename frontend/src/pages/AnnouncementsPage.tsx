import { Copy, Megaphone, Pencil, Pin, Plus, Save, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { LoadState, SaveError } from "@/components/LoadState";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/misc";
import { api, fieldError, useResource } from "@/lib/api";
import { formatNairobi } from "@/lib/time";
import type { Announcement, AnnouncementInput, Fundraiser, PublicPreview } from "@/lib/types";
import { copyText } from "@/public/share";

const empty: AnnouncementInput = { title: "", body: "", title_sw: "", body_sw: "", pinned: false, published: true };

/** Funeral arrangements and updates from family meetings, for the public Updates page. */
export function AnnouncementsPage() {
  const list = useResource<Announcement[]>("/api/manage/announcements");
  const settings = useResource<Fundraiser>("/api/manage/settings");
  const preview = useResource<PublicPreview>("/api/manage/public-preview");
  // `?new=1` (from the Overview's "Post an update") opens a blank announcement straight away.
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<{ id: number | null; input: AnnouncementInput } | null>(() =>
    params.get("new") === "1" ? { id: null, input: empty } : null,
  );

  if (!list.data) return <LoadState loading={list.loading} error={list.error} onRetry={list.reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Announcements</h1>
          <p className="mt-1 text-stone-600">Burial arrangements and updates from family meetings, shown on the public Updates page.</p>
        </div>
        {!editing && (
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing({ id: null, input: empty })}>
            New announcement
          </Button>
        )}
      </div>

      {editing && (
        <Editor
          key={editing.id ?? "new"}
          id={editing.id}
          initial={editing.input}
          onDone={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}

      {list.data.length === 0 && !editing ? (
        <Card>
          <EmptyState icon={<Megaphone className="size-8" />} title="No announcements yet">
            Post the burial date, meeting outcomes or any change of plan. Pin the most important one so it shows near the top of the public page.
          </EmptyState>
        </Card>
      ) : (
        list.data.map((a) => (
          <Card key={a.id}>
            <CardBody className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {a.pinned && (
                  <Badge tone="warning">
                    <Pin className="size-3.5" aria-hidden /> Pinned
                  </Badge>
                )}
                <Badge tone={a.published ? "success" : "neutral"}>{a.published ? "Published" : "Draft"}</Badge>
                <span className="text-sm text-stone-500">{formatNairobi(a.created_at)}</span>
              </div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">{a.title}</h2>
              {a.body && <p className="leading-relaxed whitespace-pre-line text-stone-700">{a.body}</p>}
              {(a.title_sw || a.body_sw) && (
                <div lang="sw" className="border-l-2 border-stone-200 pl-3">
                  <p className="text-[13px] font-semibold tracking-wide text-stone-500 uppercase">Kiswahili</p>
                  {a.title_sw && <p className="font-semibold text-stone-800">{a.title_sw}</p>}
                  {a.body_sw && <p className="leading-relaxed whitespace-pre-line text-stone-700">{a.body_sw}</p>}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pencil className="size-4" aria-hidden />}
                  onClick={() =>
                    setEditing({ id: a.id, input: { title: a.title, body: a.body, title_sw: a.title_sw, body_sw: a.body_sw, pinned: a.pinned, published: a.published } })
                  }
                >
                  Edit
                </Button>
                <CopyButton text={whatsAppText(a, settings.data, preview.data?.public_url ?? null)} />
                <DeleteButton id={a.id} title={a.title} onDeleted={list.reload} />
              </div>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}

function whatsAppText(a: Announcement, f: Fundraiser | null, publicUrl: string | null): string {
  const heading = f?.memorial_name ? `*In loving memory of ${f.memorial_name}*` : f ? `*${f.name}*` : "";
  return [heading, heading ? "" : null, `*${a.title}*`, a.body, publicUrl ? "" : null, publicUrl ? `${publicUrl}/updates` : null]
    .filter((line) => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<Copy className="size-4" aria-hidden />}
      onClick={() => void copyText(text).then((ok) => ok && (setCopied(true), window.setTimeout(() => setCopied(false), 2000)))}
    >
      {copied ? "Copied" : "Copy for WhatsApp"}
    </Button>
  );
}

function DeleteButton({ id, title, onDeleted }: { id: number; title: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`Delete “${title}”? It will disappear from the public page.`)) return;
    setBusy(true);
    try {
      await api.delete(`/api/manage/announcements/${id}`);
      onDeleted();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="ghost" size="sm" busy={busy} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => void remove()}>
      Delete
    </Button>
  );
}

function Editor({ id, initial, onDone }: { id: number | null; initial: AnnouncementInput; onDone: () => void }) {
  const [input, setInput] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = <K extends keyof AnnouncementInput>(key: K, value: AnnouncementInput[K]) => setInput((i) => ({ ...i, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (id === null) await api.post<Announcement>("/api/manage/announcements", input);
      else await api.put<Announcement>(`/api/manage/announcements/${id}`, input);
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <Card>
        <CardHeader title={id === null ? "New announcement" : "Edit announcement"} />
        <CardBody className="space-y-4">
          <Field label="Title" htmlFor="an-title" error={fieldError(error, "title")}>
            <Input id="an-title" value={input.title} maxLength={120} placeholder="e.g. Burial on Saturday 14 November" onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Message" htmlFor="an-body" optional error={fieldError(error, "body")} hint="Line breaks are kept.">
            <Textarea id="an-body" rows={6} value={input.body} onChange={(e) => set("body", e.target.value)} />
          </Field>
          <fieldset className="space-y-4 rounded-xl border border-stone-200 p-4">
            <legend className="px-1 font-semibold text-stone-800">In Kiswahili (optional)</legend>
            <p className="-mt-1 text-sm text-stone-600">Shown when a visitor switches the public page to Kiswahili. Left empty, the English is shown.</p>
            <Field label="Title in Kiswahili" htmlFor="an-title-sw" optional error={fieldError(error, "title_sw")}>
              <Input id="an-title-sw" lang="sw" value={input.title_sw} maxLength={120} placeholder="e.g. Mazishi Jumamosi tarehe 14 Novemba" onChange={(e) => set("title_sw", e.target.value)} />
            </Field>
            <Field label="Message in Kiswahili" htmlFor="an-body-sw" optional error={fieldError(error, "body_sw")}>
              <Textarea id="an-body-sw" lang="sw" rows={6} value={input.body_sw} onChange={(e) => set("body_sw", e.target.value)} />
            </Field>
          </fieldset>
          <Checkbox checked={input.pinned} onChange={(e) => set("pinned", e.target.checked)} label="Pin to the top" hint="The pinned announcement shows near the top of the public home page." />
          <Checkbox checked={input.published} onChange={(e) => set("published", e.target.checked)} label="Publish now" hint="Leave unticked to keep it as a draft." />
          <SaveError error={error && !["title", "body", "title_sw", "body_sw"].some((f) => fieldError(error, f)) ? error : null} />
          <div className="flex gap-3">
            <Button type="submit" busy={busy} icon={<Save className="size-4" aria-hidden />}>
              {input.published ? "Save and publish" : "Save draft"}
            </Button>
            <Button variant="secondary" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}
