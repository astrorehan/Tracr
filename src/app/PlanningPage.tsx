import { useLocation, useNavigate } from 'react-router-dom'
import { Segmented } from '@/components/ui/Segmented'
import { useT } from '@/features/settings/language-context'
import { BudgetsPage } from './BudgetsPage'
import { BillsPage } from './BillsPage'
import { GoalsPage } from './GoalsPage'

type Tab = 'budgets' | 'bills' | 'goals'

const PATH: Record<Tab, string> = {
  budgets: '/budgets',
  bills: '/bills',
  goals: '/goals',
}

function tabFromPath(pathname: string): Tab {
  if (pathname.startsWith('/bills')) return 'bills'
  if (pathname.startsWith('/goals')) return 'goals'
  return 'budgets'
}

/**
 * One home for the three planning tools — Budgets, Bills, and Savings goals.
 * Each still owns its route (/budgets, /bills, /goals) so existing links keep
 * working; this shell just adds the tab switcher on top and renders the active
 * page. The sidebar collapses all three into a single "Rencana" entry.
 */
export function PlanningPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const tab = tabFromPath(pathname)

  const options = [
    { value: 'budgets' as const, label: t('nav.budgets') },
    { value: 'bills' as const, label: t('nav.bills') },
    { value: 'goals' as const, label: t('nav.goals') },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex justify-center sm:justify-start">
        <Segmented
          value={tab}
          onChange={(v) => navigate(PATH[v])}
          options={options}
          aria-label={t('nav.planning')}
        />
      </div>

      {tab === 'budgets' && <BudgetsPage />}
      {tab === 'bills' && <BillsPage />}
      {tab === 'goals' && <GoalsPage />}
    </div>
  )
}
