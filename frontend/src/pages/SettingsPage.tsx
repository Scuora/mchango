import { Download, ImageUp, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { LoadState, SaveError } from "@/components/LoadState";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Choice, DateField } from "@/components/ui/pickers";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui/misc";
import { api, fieldError, useResource } from "@/lib/api";
import { parseKes, toInput } from "@/lib/money";
import type { Account, AccountInput, AccountKind, Fundraiser, FundraiserUpdate, GivingMethod, Organiser, PublicDetailsUpdate, PublicPreview } from "@/lib/types";

const ACCOUNT_KINDS: { value: AccountKind; label: string }[] = [
  { value: "mpesa", label: "M-Pesa" },
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
];

export function SettingsPage() {
  const settings = useResource<Fundraiser>("/api/manage/settings");
  const accounts = useResource<Account[]>("/api/manage/accounts");
  if (!settings.data || !accounts.data) {
    return <LoadState loading={settings.loading || accounts.loading} error={settings.error ?? accounts.error} onRetry={() => (settings.reload(), accounts.reload())} />;
  }
  return (
    <div className="space-y-4">
      <h1 className="page-title">Settings</h1>
      <MemorialPhotoCard fundraiser={settings.data} onSaved={settings.setData} />
      <LinkPreviewCard fundraiser={settings.data} onSaved={settings.setData} />
      <FundraiserForm fundraiser={settings.data} accounts={accounts.data} onSaved={settings.setData} />
      <PublicDetailsCard fundraiser={settings.data} onSaved={settings.setData} />
      <AccountsCard accounts={accounts.data} onChanged={accounts.reload} />
      <Card>
        <CardHeader title="Data export" description="Private: includes original names, numbers and personal activity." />
        <CardBody className="space-y-3 text-[15px]">
          <div className="flex flex-col gap-2 sm:flex-row">
            <a href="/api/manage/export/transactions.csv" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 font-medium text-stone-900 no-underline hover:bg-stone-50 hover:no-underline">
              <Download className="size-4" aria-hidden /> Transactions (CSV)
            </a>
            <a href="/api/manage/export/full.json" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 font-medium text-stone-900 no-underline hover:bg-stone-50 hover:no-underline">
              <Download className="size-4" aria-hidden /> Everything (JSON)
            </a>
          </div>
          <p className="text-sm text-stone-600">
            Exports are not backups. Back up the database with <code className="rounded bg-stone-100 px-1">mchango backup</code> and copy the uploads folder (statements and
            receipts) as described in the README.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function FundraiserForm({ fundraiser, accounts, onSaved }: { fundraiser: Fundraiser; accounts: Account[]; onSaved: (f: Fundraiser) => void }) {
  const initial = () => ({
    name: fundraiser.name,
    description: fundraiser.description,
    memorialName: fundraiser.memorial_name,
    memorialDates: fundraiser.memorial_dates,
    memorialTribute: fundraiser.memorial_tribute,
    target: toInput(fundraiser.target_minor),
    startDate: fundraiser.start_date ?? "",
    opening: toInput(fundraiser.opening_funds_minor || null),
    openingDate: fundraiser.opening_funds_date ?? "",
    openingNote: fundraiser.opening_funds_note,
    openingAccount: fundraiser.opening_funds_account_id ? String(fundraiser.opening_funds_account_id) : "",
    anonymousLabel: fundraiser.anonymous_label,
    showReferenceHint: fundraiser.show_reference_hint,
    showPromises: fundraiser.show_promises,
    published: fundraiser.public_page_enabled,
  });
  const [form, setForm] = useState(initial);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(initial()), [fundraiser]);
  const set = <K extends keyof ReturnType<typeof initial>>(key: K, value: ReturnType<typeof initial>[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    let target: number | null = null;
    if (form.target.trim()) {
      const r = parseKes(form.target);
      if (r.ok) target = r.minor;
      else errors.target_minor = r.error;
    }
    let opening: number | null = null;
    if (form.opening.trim()) {
      const r = parseKes(form.opening);
      if (r.ok) opening = r.minor;
      else errors.opening_funds_minor = r.error;
    }
    setLocalErrors(errors);
    if (Object.keys(errors).length) return;
    const body: FundraiserUpdate = {
      name: form.name,
      description: form.description,
      memorial_name: form.memorialName,
      memorial_dates: form.memorialDates,
      memorial_tribute: form.memorialTribute,
      target_minor: target,
      start_date: form.startDate || null,
      opening_funds_minor: opening,
      opening_funds_date: opening ? form.openingDate || null : null,
      opening_funds_note: opening ? form.openingNote : "",
      opening_funds_account_id: opening && form.openingAccount ? Number(form.openingAccount) : null,
      anonymous_label: form.anonymousLabel,
      show_reference_hint: form.showReferenceHint,
      show_promises: form.showPromises,
      public_page_enabled: form.published,
    };
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      onSaved(await api.put<Fundraiser>("/api/manage/settings", body));
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const err = (field: string) => localErrors[field] ?? fieldError(error, field);
  const hasOpening = form.opening.trim() !== "";

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <Card>
        <CardHeader title="Fundraiser" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="In loving memory of" htmlFor="s-memorial" optional error={err("memorial_name")} hint="Shown at the top of the public page and in WhatsApp updates.">
            <Input id="s-memorial" value={form.memorialName} onChange={(e) => set("memorialName", e.target.value)} maxLength={120} placeholder="e.g. Mzee Joseph Ochieng Odhiambo" />
          </Field>
          <Field label="Dates" htmlFor="s-memorial-dates" optional error={err("memorial_dates")}>
            <Input id="s-memorial-dates" value={form.memorialDates} onChange={(e) => set("memorialDates", e.target.value)} maxLength={40} placeholder="e.g. 1948 – 2026" />
          </Field>
          <Field label="Tribute line" htmlFor="s-memorial-tribute" optional error={err("memorial_tribute")} className="sm:col-span-2" hint="Shown in italics under the dates, e.g. a farewell in the family's language.">
            <Input id="s-memorial-tribute" value={form.memorialTribute} onChange={(e) => set("memorialTribute", e.target.value)} maxLength={160} />
          </Field>
          <Field label="Fundraiser name" htmlFor="s-name" error={err("name")} className="sm:col-span-2">
            <Input id="s-name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} placeholder="e.g. Funeral of the late Mzee Joseph Odhiambo" />
          </Field>
          <Field label="Purpose" htmlFor="s-description" error={err("description")} className="sm:col-span-2" hint="Shown at the top of the public page.">
            <Textarea id="s-description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field
            label="Target (KES)"
            htmlFor="s-target"
            optional
            error={err("target_minor")}
            hint={
              <>
                The family&rsquo;s share is the sum of its <Link to="/manage/pledges">pledges</Link>; family, friends and well-wishers are asked for the rest.
              </>
            }
          >
            <Input id="s-target" inputMode="decimal" value={form.target} onChange={(e) => set("target", e.target.value)} />
          </Field>
          <Field label="Start date" htmlFor="s-start" optional error={err("start_date")}>
            <DateField id="s-start" value={form.startDate} onChange={(v) => set("startDate", v)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Opening funds"
          description="Money the fundraiser already held before you started recording here. It is shown separately and is not counted as a contribution."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (KES)" htmlFor="s-opening" optional error={err("opening_funds_minor")} hint="Leave empty if there were none.">
            <Input id="s-opening" inputMode="decimal" value={form.opening} onChange={(e) => set("opening", e.target.value)} />
          </Field>
          {hasOpening && (
            <>
              <Field label="Held as of" htmlFor="s-opening-date" error={err("opening_funds_date")}>
                <DateField id="s-opening-date" value={form.openingDate} onChange={(v) => set("openingDate", v)} />
              </Field>
              <Field label="Held in" htmlFor="s-opening-account" error={err("opening_funds_account_id")}>
                <Choice
                  id="s-opening-account"
                  value={form.openingAccount}
                  options={accounts.map((a) => ({ value: String(a.id), label: a.name }))}
                  onChange={(v) => set("openingAccount", v)}
                />
              </Field>
              <Field label="Explanation (shown publicly)" htmlFor="s-opening-note" error={err("opening_funds_note")} className="sm:col-span-2">
                <Textarea id="s-opening-note" rows={2} value={form.openingNote} onChange={(e) => set("openingNote", e.target.value)} />
              </Field>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Public page" />
        <CardBody className="space-y-2">
          <Checkbox
            checked={form.published}
            onChange={(e) => set("published", e.target.checked)}
            label="Publish the public page"
            hint="Anyone with the link can see totals, public names, spending and published receipts. Private details are never shown."
          />
          <Field label="Name shown for anonymous contributors" htmlFor="s-anon" error={err("anonymous_label")}>
            <Input id="s-anon" value={form.anonymousLabel} maxLength={60} onChange={(e) => set("anonymousLabel", e.target.value)} />
          </Field>
          <Checkbox
            checked={form.showReferenceHint}
            onChange={(e) => set("showReferenceHint", e.target.checked)}
            label="Show the last 4 characters of M-Pesa codes"
            hint="Not recommended: contributors can confirm their gift privately on “Check my contribution” instead."
          />
          <Checkbox checked={form.showPromises} onChange={(e) => set("showPromises", e.target.checked)} label="Show outstanding pledges and unpaid bills" />
        </CardBody>
      </Card>

      {error !== null && Object.keys(localErrors).length === 0 && !["name", "description", "target_minor", "start_date", "opening_funds_minor", "opening_funds_date", "opening_funds_note", "opening_funds_account_id", "anonymous_label"].some((f) => fieldError(error, f)) ? (
        <SaveError error={error} />
      ) : null}
      <div className="sticky bottom-0 z-10 -mx-4 flex gap-3 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-lg items-center">
        <Button type="submit" busy={busy} icon={<Save className="size-4" aria-hidden />}>
          Save settings
        </Button>
        {saved && <span className="pop text-sm text-sage-800" role="status">Saved</span>}
      </div>
    </form>
  );
}

function AccountsCard({ accounts, onChanged }: { accounts: Account[]; onChanged: () => void }) {
  const [adding, setAdding] = useState<AccountInput>({ name: "", kind: "mpesa", number_hint: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post<Account>("/api/manage/accounts", { ...adding, number_hint: adding.number_hint || null });
      setAdding({ name: "", kind: "mpesa", number_hint: "" });
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Where money is kept" description="Accounts used in records and statements. Transfers between them do not change totals." />
      <CardBody className="space-y-4">
        <ul className="space-y-3">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} onChanged={onChanged} />
          ))}
        </ul>
        <form onSubmit={add} className="grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
          <Field label="New account name" htmlFor="acc-new-name" error={fieldError(error, "name")}>
            <Input id="acc-new-name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
          </Field>
          <Field label="Type" htmlFor="acc-new-kind">
            <Choice id="acc-new-kind" value={adding.kind} options={ACCOUNT_KINDS} onChange={(v) => setAdding({ ...adding, kind: v as AccountKind })} />
          </Field>
          <Field label="Last digits" htmlFor="acc-new-hint" optional error={fieldError(error, "number_hint")}>
            <Input id="acc-new-hint" inputMode="numeric" value={adding.number_hint ?? ""} onChange={(e) => setAdding({ ...adding, number_hint: e.target.value })} />
          </Field>
          <Button type="submit" variant="secondary" busy={busy} disabled={!adding.name.trim()} icon={<Plus className="size-4" aria-hidden />}>
            Add
          </Button>
        </form>
        {error !== null && !fieldError(error, "name") && !fieldError(error, "number_hint") ? <SaveError error={error} /> : null}
        <Notice tone="info">The last digits of an M-Pesa number let the app warn you if a statement belongs to a different line.</Notice>
      </CardBody>
    </Card>
  );
}

function AccountRow({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [name, setName] = useState(account.name);
  const [hint, setHint] = useState(account.number_hint ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const changed = name !== account.name || hint !== (account.number_hint ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put<Account>(`/api/manage/accounts/${account.id}`, { name, kind: account.kind, number_hint: hint || null });
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
        <Field label="Name" htmlFor={`acc-${account.id}-name`} error={fieldError(error, "name")}>
          <Input id={`acc-${account.id}-name`} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type" htmlFor={`acc-${account.id}-kind`}>
          <Input id={`acc-${account.id}-kind`} value={ACCOUNT_KINDS.find((k) => k.value === account.kind)?.label ?? account.kind} disabled />
        </Field>
        <Field label="Last digits" htmlFor={`acc-${account.id}-hint`} optional error={fieldError(error, "number_hint")}>
          <Input id={`acc-${account.id}-hint`} inputMode="numeric" value={hint} onChange={(e) => setHint(e.target.value)} disabled={account.kind !== "mpesa"} />
        </Field>
        <Button type="submit" variant="secondary" busy={busy} disabled={!changed}>
          Save
        </Button>
      </form>
      {error !== null && !fieldError(error, "name") && !fieldError(error, "number_hint") ? <SaveError error={error} /> : null}
    </li>
  );
}

/** Shrinks a photo in the browser so the public page stays light on mobile data. */
async function shrinkPhoto(file: File, maxSide = 1000): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be prepared."))), "image/jpeg", 0.86),
  );
}

function MemorialPhotoCard({ fundraiser, onSaved }: { fundraiser: Fundraiser; onSaved: (f: Fundraiser) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const version = fundraiser.memorial_photo_updated_at;
  const src = version ? `/api/public/memorial-photo?v=${encodeURIComponent(version)}` : null;

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", await shrinkPhoto(file), "memorial.jpg");
      onSaved(await api.upload<Fundraiser>("/api/manage/settings/photo", form, "PUT"));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove the photo from the public page?")) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.delete<Fundraiser>("/api/manage/settings/photo"));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Memorial photo"
        description="Shown in a circle at the top of the public page and on the opening screen. A clear, well-lit photo of the face works best."
      />
      <CardBody className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        {src ? (
          <img src={src} alt="Memorial photo" className="size-28 shrink-0 rounded-full object-cover ring-1 ring-stone-300" />
        ) : (
          <div className="flex size-28 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm text-stone-500 ring-1 ring-stone-200">No photo</div>
        )}
        <div className="space-y-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void choose(e)} aria-label="Choose a photo" />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={busy} icon={<ImageUp className="size-4" aria-hidden />} onClick={() => input.current?.click()}>
              {src ? "Replace photo" : "Add photo"}
            </Button>
            {src && (
              <Button variant="ghost" disabled={busy} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => void remove()}>
                Remove
              </Button>
            )}
          </div>
          <p className="text-sm text-stone-600">The photo is only public once the page is published.</p>
          <SaveError error={error} />
        </div>
      </CardBody>
    </Card>
  );
}

const METHODS: { value: GivingMethod | ""; label: string }[] = [
  { value: "", label: "Not shown yet" },
  { value: "paybill", label: "Paybill (business number + account)" },
  { value: "till", label: "Till number (Buy Goods)" },
  { value: "phone", label: "Send Money to a phone number" },
];

/** What people need to act: how to give, the funeral details and who is behind the page. */
function PublicDetailsCard({ fundraiser, onSaved }: { fundraiser: Fundraiser; onSaved: (f: Fundraiser) => void }) {
  const initial = (): PublicDetailsUpdate => ({
    giving_method: fundraiser.giving_method,
    giving_number: fundraiser.giving_number,
    giving_account: fundraiser.giving_account,
    giving_name: fundraiser.giving_name,
    funeral_when: fundraiser.funeral_when,
    funeral_where: fundraiser.funeral_where,
    funeral_map_url: fundraiser.funeral_map_url,
    organisers: fundraiser.organisers,
    show_contribution_amounts: fundraiser.show_contribution_amounts,
  });
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(initial()), [fundraiser]);
  const set = <K extends keyof PublicDetailsUpdate>(key: K, value: PublicDetailsUpdate[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setOrganiser = (index: number, patch: Partial<Organiser>) =>
    set(
      "organisers",
      form.organisers.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    );

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.put<Fundraiser>("/api/manage/settings/public-details", form));
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const method = form.giving_method;
  return (
    <form onSubmit={save} noValidate>
      <Card>
        <CardHeader
          title="Contribute and funeral details"
          description="Shown at the top of the public page so people can give and know the arrangements. Anything left empty is hidden."
        />
        <CardBody className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How people send money" htmlFor="pd-method" className="sm:col-span-2">
              <Choice
                id="pd-method"
                value={method ?? ""}
                options={METHODS.map((m) => ({ value: m.value, label: m.label }))}
                onChange={(v) => set("giving_method", (v || null) as GivingMethod | null)}
              />
            </Field>
            {method && (
              <>
                <Field
                  label={method === "paybill" ? "Business number" : method === "till" ? "Till number" : "Phone number"}
                  htmlFor="pd-number"
                  error={fieldError(error, "giving_number")}
                >
                  <Input id="pd-number" inputMode={method === "phone" ? "tel" : "numeric"} value={form.giving_number} onChange={(e) => set("giving_number", e.target.value)} />
                </Field>
                {method === "paybill" && (
                  <Field label="Account number" htmlFor="pd-account" error={fieldError(error, "giving_account")}>
                    <Input id="pd-account" value={form.giving_account} onChange={(e) => set("giving_account", e.target.value)} />
                  </Field>
                )}
                <Field
                  label="Name M-Pesa shows before the PIN"
                  htmlFor="pd-name"
                  error={fieldError(error, "giving_name")}
                  hint="Exactly as M-Pesa displays it, so givers can check they have the right account."
                  className="sm:col-span-2"
                >
                  <Input id="pd-name" value={form.giving_name} onChange={(e) => set("giving_name", e.target.value)} />
                </Field>
              </>
            )}
          </div>

          <div className="grid gap-4 border-t border-stone-100 pt-5 sm:grid-cols-2">
            <Field label="When" htmlFor="pd-when" optional error={fieldError(error, "funeral_when")} hint="e.g. Saturday 14 November, 10:00 am">
              <Input id="pd-when" value={form.funeral_when} onChange={(e) => set("funeral_when", e.target.value)} />
            </Field>
            <Field label="Where" htmlFor="pd-where" optional error={fieldError(error, "funeral_where")} hint="e.g. Family home, Kaloleni, Kilifi">
              <Input id="pd-where" value={form.funeral_where} onChange={(e) => set("funeral_where", e.target.value)} />
            </Field>
            <Field
              label="Map link"
              htmlFor="pd-map"
              optional
              error={fieldError(error, "funeral_map_url")}
              hint="Paste a Google Maps link. If empty, “Open in Maps” searches for the place above."
              className="sm:col-span-2"
            >
              <Input id="pd-map" type="url" inputMode="url" value={form.funeral_map_url} onChange={(e) => set("funeral_map_url", e.target.value)} />
            </Field>
          </div>

          <fieldset className="space-y-3 border-t border-stone-100 pt-5">
            <legend className="text-sm font-medium text-stone-800">Organisers shown on the page</legend>
            <p className="text-sm text-stone-600">Only list people who agree to be named. The first one with a phone number is shown as the family contact.</p>
            {form.organisers.map((o, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-stone-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <Field label="Name" htmlFor={`org-name-${i}`}>
                  <Input id={`org-name-${i}`} value={o.name} onChange={(e) => setOrganiser(i, { name: e.target.value })} />
                </Field>
                <Field label="Role" htmlFor={`org-role-${i}`} optional>
                  <Input id={`org-role-${i}`} value={o.role} placeholder="e.g. Treasurer" onChange={(e) => setOrganiser(i, { role: e.target.value })} />
                </Field>
                <Field label="Phone" htmlFor={`org-phone-${i}`} optional>
                  <Input id={`org-phone-${i}`} inputMode="tel" value={o.phone} onChange={(e) => setOrganiser(i, { phone: e.target.value })} />
                </Field>
                <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => set("organisers", form.organisers.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            ))}
            {fieldError(error, "organisers") && <p className="text-sm font-medium text-brick-700">{fieldError(error, "organisers")}</p>}
            {form.organisers.length < 6 && (
              <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => set("organisers", [...form.organisers, { name: "", role: "", phone: "" }])}>
                Add organiser
              </Button>
            )}
          </fieldset>

          <div className="border-t border-stone-100 pt-5">
            <Checkbox
              checked={form.show_contribution_amounts}
              onChange={(e) => set("show_contribution_amounts", e.target.checked)}
              label="Show how much each person gave"
              hint="Some families prefer names only, so nobody feels compared. Totals are always shown."
            />
          </div>
          {error !== null && !fieldError(error, "giving_number") && !fieldError(error, "giving_account") && !fieldError(error, "giving_name") && !fieldError(error, "organisers") && !fieldError(error, "funeral_map_url") ? (
            <SaveError error={error} />
          ) : null}
        </CardBody>
      </Card>
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center gap-3 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-lg">
        <Button type="submit" busy={busy} icon={<Save className="size-4" aria-hidden />}>
          Save contribute and funeral details
        </Button>
        {saved && (
          <span className="pop text-sm text-sage-800" role="status">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

/** The image WhatsApp and other apps show when the page link is shared. */
function LinkPreviewCard({ fundraiser, onSaved }: { fundraiser: Fundraiser; onSaved: (f: Fundraiser) => void }) {
  const preview = useResource<PublicPreview>("/api/manage/public-preview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const version = fundraiser.share_image_updated_at;
  const src = version ? `/api/public/share-image?v=${encodeURIComponent(version)}` : null;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { createSharePreview } = await import("@/features/sharePreview");
      const host = preview.data?.public_url?.replace(/^https?:\/\//, "") ?? null;
      const blob = await createSharePreview(fundraiser, host);
      const form = new FormData();
      form.append("file", blob, "preview.jpg");
      onSaved(await api.upload<Fundraiser>("/api/manage/settings/share-image", form, "PUT"));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Link preview"
        description="The picture people see when the page link is shared on WhatsApp, Facebook or by text. It is made from the memorial photo, the name, the dates and the tribute line."
      />
      <CardBody className="space-y-3">
        {src ? (
          <img src={src} alt="Link preview" className="w-full max-w-xl rounded-lg ring-1 ring-stone-200" />
        ) : (
          <p className="text-sm text-stone-600">No preview yet. Without one, shared links show only the photo, or no picture at all.</p>
        )}
        <Button variant={src ? "secondary" : "primary"} busy={busy} icon={<ImageUp className="size-4" aria-hidden />} onClick={() => void create()}>
          {src ? "Update link preview" : "Create link preview"}
        </Button>
        <p className="text-sm text-stone-600">Update it after changing the photo, the name or the dates. Apps may keep showing an older preview for a while.</p>
        <SaveError error={error} />
      </CardBody>
    </Card>
  );
}
