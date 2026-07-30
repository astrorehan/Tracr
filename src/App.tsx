import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { useAuth } from './features/auth/useAuth'
import { DashboardSkeleton, PageSkeleton } from './components/ui/States'
import { AppLayout } from './components/AppLayout'
import { BizLayout } from './components/BizLayout'
import { SetupNotice } from './components/SetupNotice'
import { ConfirmProvider } from './components/ui/confirm'
import { ScrollToTop } from './components/ScrollToTop'
import { LoginPage } from './app/LoginPage'
import { queryClient } from './lib/queryClient'
import { setupQueryCachePersister } from './lib/queryPersister'

// Route-level code splitting keeps the initial bundle small (charts load on demand).
const DashboardPage = lazy(() =>
  import('./app/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const AccountsPage = lazy(() =>
  import('./app/AccountsPage').then((m) => ({ default: m.AccountsPage })),
)
const AccountDetailPage = lazy(() =>
  import('./app/AccountDetailPage').then((m) => ({ default: m.AccountDetailPage })),
)
const TransactionsPage = lazy(() =>
  import('./app/TransactionsPage').then((m) => ({ default: m.TransactionsPage })),
)
const SettingsPage = lazy(() =>
  import('./app/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const CategoriesPage = lazy(() =>
  import('./app/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
)
const TagsPage = lazy(() => import('./app/TagsPage').then((m) => ({ default: m.TagsPage })))
const RulesPage = lazy(() => import('./app/RulesPage').then((m) => ({ default: m.RulesPage })))
const ReportsPage = lazy(() =>
  import('./app/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)
const PlanningPage = lazy(() =>
  import('./app/PlanningPage').then((m) => ({ default: m.PlanningPage })),
)
const DebtsPage = lazy(() => import('./app/DebtsPage').then((m) => ({ default: m.DebtsPage })))
const InstallmentsPage = lazy(() =>
  import('./app/InstallmentsPage').then((m) => ({ default: m.InstallmentsPage })),
)
const ProductsPage = lazy(() =>
  import('./app/ProductsPage').then((m) => ({ default: m.ProductsPage })),
)
const ProfitPage = lazy(() => import('./app/ProfitPage').then((m) => ({ default: m.ProfitPage })))
const CurrenciesPage = lazy(() =>
  import('./app/CurrenciesPage').then((m) => ({ default: m.CurrenciesPage })),
)
const DataPage = lazy(() => import('./app/DataPage').then((m) => ({ default: m.DataPage })))
const BooksPage = lazy(() => import('./app/BooksPage').then((m) => ({ default: m.BooksPage })))
const TelegramPage = lazy(() =>
  import('./app/TelegramPage').then((m) => ({ default: m.TelegramPage })),
)
const BillingPage = lazy(() =>
  import('./app/BillingPage').then((m) => ({ default: m.BillingPage })),
)
const LegalPage = lazy(() => import('./app/LegalPage').then((m) => ({ default: m.LegalPage })))
const LandingPage = lazy(() =>
  import('./app/LandingPage').then((m) => ({ default: m.LandingPage })),
)

function RequireAuth({ cacheReady, children }: { cacheReady: boolean; children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <PageSkeleton />
  // Signed-out visitors land on the marketing page, not the login form.
  if (!session) return <Navigate to="/welcome" replace />
  // Data routes must not fetch before the offline cache is hydrated, or an
  // offline reload renders empty. Public routes read no cache, so they render
  // without waiting on IndexedDB.
  if (!cacheReady) return <PageSkeleton />
  return <>{children}</>
}

export default function App() {
  const [cacheReady, setCacheReady] = useState(false)

  useEffect(() => {
    let cleanup: (() => void) | undefined
    setupQueryCachePersister(queryClient).then((fn) => {
      cleanup = fn
      setCacheReady(true)
    })
    return () => cleanup?.()
  }, [])

  if (!isSupabaseConfigured) return <SetupNotice />

  return (
    <ConfirmProvider>
      <ScrollToTop />
      <Routes>
      <Route
        path="/welcome"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <LandingPage />
          </Suspense>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/legal/:doc"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <LegalPage />
          </Suspense>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth cacheReady={cacheReady}>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<DashboardSkeleton />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="accounts"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <AccountsPage />
            </Suspense>
          }
        />
        <Route
          path="accounts/:id"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <AccountDetailPage />
            </Suspense>
          }
        />
        <Route
          path="transactions"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <TransactionsPage />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <SettingsPage />
            </Suspense>
          }
        />
        <Route
          path="categories"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <CategoriesPage />
            </Suspense>
          }
        />
        <Route
          path="tags"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <TagsPage />
            </Suspense>
          }
        />
        <Route
          path="rules"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <RulesPage />
            </Suspense>
          }
        />
        <Route
          path="reports"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <ReportsPage />
            </Suspense>
          }
        />
        <Route
          path="budgets"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <PlanningPage />
            </Suspense>
          }
        />
        <Route
          path="bills"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <PlanningPage />
            </Suspense>
          }
        />
        <Route
          path="goals"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <PlanningPage />
            </Suspense>
          }
        />
        <Route
          path="installments"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <InstallmentsPage />
            </Suspense>
          }
        />
        {/* Buku Usaha tools share one parent route so their header and tab bar
            survive a switch between them — see BizLayout. */}
        <Route element={<BizLayout />}>
          <Route
            path="products"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <ProductsPage />
              </Suspense>
            }
          />
          <Route
            path="debts"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <DebtsPage />
              </Suspense>
            }
          />
          <Route
            path="profit"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <ProfitPage />
              </Suspense>
            }
          />
        </Route>
        <Route
          path="currencies"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <CurrenciesPage />
            </Suspense>
          }
        />
        <Route
          path="data"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <DataPage />
            </Suspense>
          }
        />
        <Route
          path="books"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <BooksPage />
            </Suspense>
          }
        />
        <Route
          path="telegram"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <TelegramPage />
            </Suspense>
          }
        />
        <Route
          path="billing"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <BillingPage />
            </Suspense>
          }
        />
      </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ConfirmProvider>
  )
}
