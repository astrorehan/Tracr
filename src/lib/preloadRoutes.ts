/**
 * Preload all lazy route chunks in the background during browser idle time.
 * This ensures that clicking any tab (Accounts, Activity, Planning, Reports, Settings, etc.)
 * renders instantly without waiting for network JS bundle downloads.
 */
export function preloadAllRoutes(): void {
  if (typeof window === 'undefined') return

  const warmChunks = () => {
    void import('@/app/DashboardPage')
    void import('@/app/AccountsPage')
    void import('@/app/AccountDetailPage')
    void import('@/app/TransactionsPage')
    void import('@/app/ReportsPage')
    void import('@/app/PlanningPage')
    void import('@/app/InstallmentsPage')
    void import('@/app/SettingsPage')
    void import('@/app/CategoriesPage')
    void import('@/app/TagsPage')
    void import('@/app/RulesPage')
    void import('@/app/ProductsPage')
    void import('@/app/DebtsPage')
    void import('@/app/ProfitPage')
    void import('@/app/CurrenciesPage')
    void import('@/app/DataPage')
    void import('@/app/BooksPage')
    void import('@/app/TelegramPage')
    void import('@/app/BillingPage')
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmChunks)
  } else {
    setTimeout(warmChunks, 500)
  }
}
