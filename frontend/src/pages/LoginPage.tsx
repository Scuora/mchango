import { LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { safeNext } from "@/features/auth";
import { useDismissBoot } from "@/lib/boot";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { SessionUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";

export function LoginPage() {
  useDismissBoot(true);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const next = safeNext(params.get("next"));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post<SessionUser>("/api/manage/auth/login", { username: username.trim(), password });
      navigate(next, { replace: true });
    } catch (e) {
      setError(e);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  const message =
    error instanceof ApiError && error.code === "invalid_credentials"
      ? "That username and password do not match. Check them and try again."
      : error
        ? errorMessage(error)
        : null;

  return (
    <main className="flex min-h-dvh items-start justify-center bg-stone-50 px-4 pt-[12vh] pb-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-plum-100 text-plum-800">
            <LockKeyhole className="size-6" aria-hidden />
          </span>
          <h1 className="font-display text-2xl font-semibold text-stone-900">Sign in to manage the fundraiser</h1>
          <p className="text-sm text-stone-600">The public page does not need a login.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm" noValidate>
          {message && (
            <Notice tone={error instanceof ApiError && error.code === "too_many_attempts" ? "warning" : "danger"}>{message}</Notice>
          )}
          <Field label="Username" htmlFor="username">
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" busy={busy} disabled={!username.trim() || !password}>
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link to="/">View the public page</Link>
        </p>
      </div>
    </main>
  );
}
