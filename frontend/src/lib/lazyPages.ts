// Management pages load on demand, so visitors to the public page never download
// them (or PrimeReact). Once someone is in management, every page is fetched in
// the background: moving between pages is then instant, and keeps working even
// if a new version is deployed while the tab is open (the old files are gone
// from the server by then, but already loaded).

import { lazy, type ComponentType } from "react";

const loaders = {
  ManageLayout: () => import("@/components/ManageLayout"),
  LoginPage: () => import("@/pages/LoginPage"),
  OverviewPage: () => import("@/pages/OverviewPage"),
  AddTransactionPage: () => import("@/pages/AddTransactionPage"),
  TransactionsPage: () => import("@/pages/TransactionsPage"),
  PledgesPage: () => import("@/pages/PledgesPage"),
  AccountsPage: () => import("@/pages/AccountsPage"),
  ChallengesPage: () => import("@/pages/ChallengesPage"),
  ChallengeDetailPage: () => import("@/pages/ChallengeDetailPage"),
  TransactionDetailPage: () => import("@/pages/TransactionDetailPage"),
  StatementsPage: () => import("@/pages/StatementsPage"),
  StatementDetailPage: () => import("@/pages/StatementDetailPage"),
  SettingsPage: () => import("@/pages/SettingsPage"),
  SharePage: () => import("@/pages/SharePage"),
  AnnouncementsPage: () => import("@/pages/AnnouncementsPage"),
  ReportsPage: () => import("@/pages/ReportsPage"),
};

type Name = keyof typeof loaders;

/** The page component exported under `name` by its module, loaded on first use. */
export function lazyPage(name: Name) {
  return lazy(() => loaders[name]().then((module) => ({ default: (module as unknown as Record<Name, ComponentType>)[name] })));
}

let prefetched = false;

/** Fetches every management page when the browser is idle. Safe to call more than once. */
export function prefetchManagement(): void {
  if (prefetched) return;
  prefetched = true;
  const run = () => {
    for (const load of Object.values(loaders)) void load().catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

/** A page file that is no longer on the server: this tab was opened before the latest deploy. */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message);
}
