import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { useAuth } from './features/auth/useAuth'
import { CenterSpinner } from './components/ui/States'
import { AppLayout } from './components/AppLayout'
import { SetupNotice } from './components/SetupNotice'
import { LoginPage } from './app/LoginPage'

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
const ReportsPage = lazy(() =>
  import('./app/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)
const BudgetsPage = lazy(() =>
  import('./app/BudgetsPage').then((m) => ({ default: m.BudgetsPage })),
)
const BillsPage = lazy(() => import('./app/BillsPage').then((m) => ({ default: m.BillsPage })))
const GoalsPage = lazy(() => import('./app/GoalsPage').then((m) => ({ default: m.GoalsPage })))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <CenterSpinner />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<CenterSpinner />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="accounts"
          element={
            <Suspense fallback={<CenterSpinner />}>
              <AccountsPage />
            </Suspense>
          }
        />
        <Route
          path="accounts/:id"
          element={
            <Suspense fallback={<CenterSpinner />}>
              <AccountDetailPage />
            </Suspense>
          }
        />
        <Route
          path="transactions"
          element={
            <Suspense fallback={<CenterSpinner />}>
              <TransactionsPage />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<CenterSpinner />}>
              <SettingsPage />
            </Suspense>
          }
        />
        <Route
          path="categories"
          element={
            <Suspense fallback={<CenterSpinner />}>
              <CategoriesPage />
            </Suspense>
          }
        />
        <Route
          path="tags"
          element={
            <Suspense fallback={<CenterSpinner />}>
              <TagsPage />
            </Suspense>
          }
        />
        <Route
          path="reports"
          element={
            <Suspense fallback={<CenterSpinner />}>
              <ReportsPage />
            </Suspense>
          }
        />
        <Route
          path="budgets"
          element={
            <Suspense fallback={<CenterSpinner />}>
              <BudgetsPage />
            </Suspense>
          }
        />
        <Route
          path="bills"
          element={
            <Suspense fallback={<CenterSpinner />}>
              <BillsPage />
            </Suspense>
          }
        />
        <Route
          path="goals"
          element={
            <Suspense fallback={<CenterSpinner />}>
              <GoalsPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
