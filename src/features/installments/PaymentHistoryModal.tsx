import { Modal } from '@/components/ui/Modal'
import { ListSkeleton } from '@/components/ui/States'
import { useT } from '@/features/settings/language-context'
import { formatMoney } from '@/lib/money'
import { useInstallmentPayments } from './api'
import type { Installment } from './types'

interface Props {
  open: boolean
  onClose: () => void
  installment: Installment
}

export function PaymentHistoryModal({ open, onClose, installment }: Props) {
  const { t } = useT()

  return (
    <Modal open={open} onClose={onClose} title={`${t('installments.history')} - ${installment.name}`}>
      {open && <PaymentHistoryBody installment={installment} />}
    </Modal>
  )
}

function PaymentHistoryBody({ installment }: { installment: Installment }) {
  const { t } = useT()
  const { data: payments = [], isLoading } = useInstallmentPayments(installment.id)

  if (isLoading) {
    return <ListSkeleton rows={3} />
  }

  if (payments.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {t('installments.historyEmpty')}
      </div>
    )
  }

  return (
    <div className="space-y-3 py-2">
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <span className="font-bold text-foreground">
                Cicilan #{p.payment_number}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">{p.paid_at}</span>
            </div>
            <div className="font-semibold text-danger">
              {formatMoney(p.amount, 'IDR')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
