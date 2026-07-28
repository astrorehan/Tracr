import { useMemo, useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import { PageHeader, Pill } from '@/components/ui/list'
import { Card } from '@/components/ui/Card'
import { CardSkeleton, EmptyState } from '@/components/ui/States'
import { useT } from '@/features/settings/language-context'
import { formatMoney } from '@/lib/money'
import { useInstallments } from '@/features/installments/api'
import { InstallmentCard } from '@/features/installments/InstallmentCard'
import { InstallmentForm } from '@/features/installments/InstallmentForm'
import { InstallmentCashflowChart } from '@/features/installments/InstallmentCashflowChart'
import { calculateRemainingAmount } from '@/features/installments/progress'
import type { Installment } from '@/features/installments/types'

export function InstallmentsPage() {
  const { t } = useT()
  const { data: installments = [], isLoading } = useInstallments()

  const [formOpen, setFormOpen] = useState(false)
  const [editingInstallment, setEditingInstallment] = useState<Installment | null>(null)

  const { activeInstallments, completedInstallments, totalMonthlyCommitment, totalRemainingPrincipal } =
    useMemo(() => {
      const active = installments.filter(
        (i) => i.status === 'active' && i.paid_months < i.tenor_months,
      )
      const completed = installments.filter(
        (i) => i.status === 'completed' || i.paid_months >= i.tenor_months,
      )

      const monthlySum = active.reduce((sum, item) => sum + item.monthly_amount, 0)
      const remainingSum = active.reduce(
        (sum, item) =>
          sum +
          calculateRemainingAmount(
            item.total_amount,
            item.monthly_amount,
            item.paid_months,
            item.tenor_months,
            item.interest_rate,
            item.interest_type,
          ),
        0,
      )

      return {
        activeInstallments: active,
        completedInstallments: completed,
        totalMonthlyCommitment: monthlySum,
        totalRemainingPrincipal: remainingSum,
      }
    }, [installments])

  function handleOpenCreate() {
    setEditingInstallment(null)
    setFormOpen(true)
  }

  function handleEdit(inst: Installment) {
    setEditingInstallment(inst)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        title={t('installments.title')}
        subtitle={t('installments.subtitle')}
        action={
          <Pill variant="solid" icon={Plus} onClick={handleOpenCreate}>
            {t('installments.add')}
          </Pill>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t('installments.summary.active')}
          </p>
          <p className="mt-1 text-2xl font-extrabold text-foreground">
            {activeInstallments.length}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t('installments.summary.monthlyTotal')}
          </p>
          <p className="mt-1 text-2xl font-extrabold text-primary">
            {formatMoney(totalMonthlyCommitment, 'IDR')}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t('installments.summary.remainingTotal')}
          </p>
          <p className="mt-1 text-2xl font-extrabold text-primary">
            {formatMoney(totalRemainingPrincipal, 'IDR')}
          </p>
        </Card>
      </div>

      {isLoading ? (
        <CardSkeleton cards={3} />
      ) : installments.length === 0 ? (
        <Card className="py-10">
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title={t('installments.emptyTitle')}
            description={t('installments.emptyBlurb')}
            action={
              <Pill variant="solid" icon={Plus} onClick={handleOpenCreate}>
                {t('installments.add')}
              </Pill>
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Projection Chart */}
          <InstallmentCashflowChart installments={installments} />

          {/* Active Installments Section */}
          {activeInstallments.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-foreground">
                {t('installments.summary.active')} ({activeInstallments.length})
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {activeInstallments.map((inst) => (
                  <InstallmentCard key={inst.id} installment={inst} onEdit={handleEdit} />
                ))}
              </div>
            </div>
          )}

          {/* Completed Installments Section */}
          {completedInstallments.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-muted-foreground">
                {t('installments.completed')} ({completedInstallments.length})
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 opacity-85">
                {completedInstallments.map((inst) => (
                  <InstallmentCard key={inst.id} installment={inst} onEdit={handleEdit} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Form Modal */}
      {formOpen && (
        <InstallmentForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          installmentToEdit={editingInstallment}
        />
      )}
    </div>
  )
}
