import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource-variable/source-sans-3";
import "./index.css";
import { useDismissBoot } from "@/lib/boot";

import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { PublicLayout } from "@/public/PublicLayout";
import { ContributionsPage } from "@/public/ContributionsPage";
import { UpdatePage } from "@/public/UpdatePage";
import { CheckPage, ExpensesPage, HomePage, UpdatesPage } from "@/public/pages";
import { TrendsPage } from "@/public/TrendsPage";

// Management is loaded separately, so visitors to the public page never
// download it (or PrimeReact).
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((module) => ({ default: module[name] })));
const ManageLayout = page(() => import("@/components/ManageLayout"), "ManageLayout");
const LoginPage = page(() => import("@/pages/LoginPage"), "LoginPage");
const OverviewPage = page(() => import("@/pages/OverviewPage"), "OverviewPage");
const AddTransactionPage = page(() => import("@/pages/AddTransactionPage"), "AddTransactionPage");
const TransactionsPage = page(() => import("@/pages/TransactionsPage"), "TransactionsPage");
const PledgesPage = page(() => import("@/pages/PledgesPage"), "PledgesPage");
const TransactionDetailPage = page(() => import("@/pages/TransactionDetailPage"), "TransactionDetailPage");
const StatementsPage = page(() => import("@/pages/StatementsPage"), "StatementsPage");
const StatementDetailPage = page(() => import("@/pages/StatementDetailPage"), "StatementDetailPage");
const SettingsPage = page(() => import("@/pages/SettingsPage"), "SettingsPage");
const SharePage = page(() => import("@/pages/SharePage"), "SharePage");
const AnnouncementsPage = page(() => import("@/pages/AnnouncementsPage"), "AnnouncementsPage");
const ReportsPage = page(() => import("@/pages/ReportsPage"), "ReportsPage");

function NotFound() {
  useDismissBoot(true);
  return (
    <main className="mx-auto max-w-md px-4 pt-[20vh] text-center">
      <h1 className="font-display text-3xl font-semibold text-stone-900">Page not found</h1>
      <p className="mt-2 text-stone-600">That address does not exist.</p>
      <p className="mt-4">
        <Link to="/">Go to the fundraiser page</Link>
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="updates" element={<UpdatesPage />} />
          <Route path="updates/:id" element={<UpdatePage />} />
          <Route path="contributions" element={<ContributionsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="trends" element={<TrendsPage />} />
          <Route path="check" element={<CheckPage />} />
        </Route>
        <Route path="/manage/login" element={<LoginPage />} />
        <Route path="/manage" element={<ManageLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="add" element={<AddTransactionPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="pledges" element={<PledgesPage />} />
          <Route path="transactions/:id" element={<TransactionDetailPage />} />
          <Route path="statements" element={<StatementsPage />} />
          <Route path="statements/:id" element={<StatementDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="share" element={<SharePage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
