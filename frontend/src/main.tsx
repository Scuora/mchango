import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource-variable/source-sans-3";
import "./index.css";
import { useDismissBoot } from "@/lib/boot";

import { StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { lazyPage } from "@/lib/lazyPages";
import { PublicLayout } from "@/public/PublicLayout";
import { ContributionsPage } from "@/public/ContributionsPage";
import { ContributePage } from "@/public/ContributePage";
import { UpdatePage } from "@/public/UpdatePage";
import { CheckPage, ExpensesPage, HomePage, UpdatesPage } from "@/public/pages";
import { TrendsPage } from "@/public/TrendsPage";

// Management is loaded separately, so visitors to the public page never
// download it (or PrimeReact). See lib/lazyPages.
const ManageLayout = lazyPage("ManageLayout");
const LoginPage = lazyPage("LoginPage");
const OverviewPage = lazyPage("OverviewPage");
const AddTransactionPage = lazyPage("AddTransactionPage");
const TransactionsPage = lazyPage("TransactionsPage");
const PledgesPage = lazyPage("PledgesPage");
const TransactionDetailPage = lazyPage("TransactionDetailPage");
const StatementsPage = lazyPage("StatementsPage");
const StatementDetailPage = lazyPage("StatementDetailPage");
const SettingsPage = lazyPage("SettingsPage");
const SharePage = lazyPage("SharePage");
const AnnouncementsPage = lazyPage("AnnouncementsPage");
const ReportsPage = lazyPage("ReportsPage");

/** A page that fails to load shows a notice in place; moving to another page clears it. */
function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <PageErrorBoundary resetKey={pathname}>{children}</PageErrorBoundary>;
}

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
      <RouteBoundary>
      <Suspense fallback={null}>
        <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="updates" element={<UpdatesPage />} />
          <Route path="updates/:id" element={<UpdatePage />} />
          <Route path="contribute" element={<ContributePage />} />
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
      </RouteBoundary>
    </BrowserRouter>
  </StrictMode>,
);
