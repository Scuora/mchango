import { useCallback, useEffect, useRef, useState } from "react";

/** An error from the API, with the backend's code, message and field. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | null;
  /** For "possible_duplicate": the records that look the same. */
  readonly matches: number[];

  constructor(status: number, code: string, message: string, field: string | null = null, matches: number[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
    this.matches = matches;
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

type Listener = () => void;
let unauthenticatedListener: Listener | null = null;

/** Called whenever a management request comes back 401 (signed out or session expired). */
export function onUnauthenticated(listener: Listener | null): void {
  unauthenticatedListener = listener;
}

function fallbackMessage(status: number): string {
  if (status === 403) return "This request was refused. Open the management page from its usual address.";
  if (status === 404) return "Not found.";
  if (status === 413) return "The file is too large.";
  if (status >= 500) return "Something went wrong on the server. Nothing was saved; please try again.";
  return "The request could not be completed.";
}

async function request<T>(method: Method, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (method !== "GET") {
    // Required by the backend for every change (cross-site request protection).
    headers["x-mchango"] = "1";
  }
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, { method, headers, body: payload, credentials: "same-origin", signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network", "Could not reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    let code = "error";
    let message = fallbackMessage(response.status);
    let field: string | null = null;
    let matches: number[] = [];
    try {
      const data = (await response.json()) as { error?: { code?: string; message?: string; field?: string; matches?: number[] } };
      if (data.error) {
        code = data.error.code ?? code;
        message = data.error.message ?? message;
        field = data.error.field ?? null;
        matches = data.error.matches ?? [];
      }
    } catch {
      // Not JSON; keep the fallback message.
    }
    if (response.status === 401 && code === "unauthenticated" && !path.startsWith("/api/manage/auth/")) {
      unauthenticatedListener?.();
    }
    throw new ApiError(response.status, code, message, field, matches);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  upload: <T>(path: string, form: FormData, method: "POST" | "PUT" = "POST") => request<T>(method, path, form),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

/** Field-level error message for a form input, when the API named that field. */
export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError && error.field === field ? error.message : undefined;
}

export interface Resource<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** Fetches again, keeping the current data visible meanwhile. */
  reload: () => void;
  setData: (data: T) => void;
}

/** Loads `path` (skips when null) and keeps loading, failure and retry consistent. */
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(path !== null);
  const [version, setVersion] = useState(0);
  const lastPath = useRef(path);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    if (lastPath.current !== path) {
      lastPath.current = path;
      setData(null);
    }
    const controller = new AbortController();
    setLoading(true);
    api
      .get<T>(path, controller.signal)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload, setData };
}
