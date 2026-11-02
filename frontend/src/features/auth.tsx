import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { ApiError, api, onUnauthenticated } from "@/lib/api";
import type { SessionUser } from "@/lib/types";

interface Auth {
  user: SessionUser;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth outside RequireAuth");
  return auth;
}

/** Only allows returning to management pages after sign-in (no open redirects). */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/manage") && !next.startsWith("/manage/login") && !next.startsWith("//") ? next : "/manage";
}

export function loginPath(location: { pathname: string; search: string }): string {
  return `/manage/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}

type State = { status: "checking" } | { status: "signed_in"; user: SessionUser } | { status: "failed"; error: unknown };

/** Checks the session and sends signed-out visitors to the sign-in page. */
export function RequireAuth({ children, fallback }: { children: ReactNode; fallback: (state: "checking" | { error: unknown; retry: () => void }) => ReactNode }) {
  const [state, setState] = useState<State>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    api
      .get<SessionUser>("/api/manage/auth/me")
      .then((user) => !cancelled && setState({ status: "signed_in", user }))
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          navigate(loginPath(location), { replace: true });
        } else {
          setState({ status: "failed", error });
        }
      });
    return () => {
      cancelled = true;
    };
    // Only on first load or retry; navigating inside the shell keeps the session.
  }, [attempt]);

  // Any management request that comes back 401 means the session has ended.
  useEffect(() => {
    onUnauthenticated(() => navigate(loginPath(window.location), { replace: true }));
    return () => onUnauthenticated(null);
  }, [navigate]);

  const signOut = useCallback(async () => {
    try {
      await api.post("/api/manage/auth/logout");
    } finally {
      navigate("/manage/login", { replace: true });
    }
  }, [navigate]);

  if (state.status === "checking") return <>{fallback("checking")}</>;
  if (state.status === "failed") return <>{fallback({ error: state.error, retry: () => setAttempt((a) => a + 1) })}</>;
  return <AuthContext.Provider value={{ user: state.user, signOut }}>{children}</AuthContext.Provider>;
}
