import { useState } from 'react'
import { Info } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies'
import { amountToMinor, fromMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useCreateAccount, useUpdateAccount } from './api'
import { ACCOUNT_COLORS, ACCOUNT_TYPES, LIABILITY_TYPES } from './meta'
import type { Account, AccountType } from '@/types/db'
import { useT } from '@/features/settings/language-context'

interface Props {
  open: boolean
  onClose: () => void
  account?: Account | null
}

export function AccountForm({ open, onClose, account }: Props) {
  if (!open) return null
  return <AccountFormBody onClose={onClose} account={account ?? null} open={open} />
}

function AccountFormBody({
  open,
  onClose,
  account,
}: {
  open: boolean
  onClose: () => void
  account: Account | null
}) {
  const { t } = useT()
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const editing = Boolean(account)

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'cash')
  const [isLiability, setIsLiability] = useState(account?.is_liability ?? false)
  const [currency, setCurrency] = useState(account?.currency ?? 'IDR')
  // For liabilities the opening balance is stored negative; show it as a positive "owed".
  const [opening, setOpening] = useState(
    account ? String(fromMinorUnits(Math.abs(account.opening_balance), account.currency)) : '',
  )
  const [creditLimit, setCreditLimit] = useState(
    account?.credit_limit != null
      ? String(fromMinorUnits(account.credit_limit, account.currency))
      : '',
  )
  const [excludeFromStats, setExcludeFromStats] = useState(account?.exclude_from_stats ?? false)
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending
  // Credit cards & loans are debts by nature, so we don't ask — we explain. The
  // explicit "money I owe" toggle only shows for ambiguous types (cash/other/etc).
  const isDebtType = LIABILITY_TYPES.has(type)

  // Picking a debt type forces the liability flag; the user can still override others.
  function changeType(next: AccountType) {
    setType(next)
    setIsLiability(LIABILITY_TYPES.has(next))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('acc.form.errName'))
      return
    }
    const magnitude = opening ? amountToMinor(opening, currency) : 0
    // Liabilities carry a negative balance (debt subtracts from net worth).
    const opening_balance = isLiability ? -Math.abs(magnitude) : magnitude
    // Credit limit only applies to liabilities; null when unset or not a debt.
    const credit_limit =
      isLiability && creditLimit.trim() ? Math.abs(amountToMinor(creditLimit, currency)) : null
    try {
      if (account) {
        await update.mutateAsync({
          id: account.id,
          patch: {
            name: name.trim(),
            type,
            currency,
            opening_balance,
            color,
            is_liability: isLiability,
            credit_limit,
            exclude_from_stats: excludeFromStats,
          },
        })
      } else {
        await create.mutateAsync({
          name: name.trim(),
          type,
          currency,
          opening_balance,
          color,
          icon: null,
          is_liability: isLiability,
          credit_limit,
          exclude_from_stats: excludeFromStats,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('acc.form.errGeneric'))
    }
  }

  const footer = (
    <div className="flex gap-3">
      <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" form="account-form" className="flex-1" loading={pending}>
        {editing ? t('common.save') : t('acc.form.create')}
      </Button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('acc.form.edit') : t('acc.form.new')}
      footer={footer}
    >
      <form id="account-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('common.name')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('acc.form.placeholder')}
            autoFocus
          />
        </Field>

        <Field label={t('common.type') ?? 'Type'}>
          <Select value={type} onChange={(e) => changeType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((typeObj) => (
              <option key={typeObj.value} value={typeObj.value}>
                {t(typeObj.label)}
              </option>
            ))}
          </Select>
        </Field>

        {isDebtType ? (
          // Debt type → no question, just explain what it means in plain terms.
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-[12px] font-medium leading-snug text-muted-foreground">
              {t('acc.form.debtTracked')} <span className="font-semibold text-danger">{t('acc.form.debtWord')}</span> {t('acc.form.debtDesc')}
            </p>
          </div>
        ) : (
          // Ambiguous type → let the user mark it a debt, in plain language.
          <button
            type="button"
            role="switch"
            aria-checked={isLiability}
            onClick={() => setIsLiability((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50"
          >
            <span
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                isLiability ? 'bg-danger' : 'bg-surface-muted',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                  isLiability ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
                )}
              />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                {t('acc.form.debtLabel')}
              </span>
              <span className="block text-xs font-medium text-muted-foreground">
                {isLiability ? t('acc.form.debtCounted') : t('acc.form.debtTurnOn')}
              </span>
            </span>
          </button>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('common.currency')}>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code} — {CURRENCIES[code].symbol}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={isLiability ? t('acc.form.amountOwed') : t('acc.form.openingBal')}>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        {isLiability && (
          <p className="-mt-2 px-1 text-xs font-medium text-muted-foreground">
            {t('acc.form.oweDesc')}
          </p>
        )}

        {isLiability && (
          <Field label={t('acc.form.limit')}>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder={t('acc.form.limitPlaceholder')}
            />
          </Field>
        )}

        <Field label={t('acc.form.color')}>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className="h-8 w-8 rounded-full border-2 transition hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? 'var(--foreground)' : 'transparent',
                }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </Field>

        <button
          type="button"
          role="switch"
          aria-checked={excludeFromStats}
          onClick={() => setExcludeFromStats((v) => !v)}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50"
        >
          <span
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              excludeFromStats ? 'bg-primary' : 'bg-surface-muted',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                excludeFromStats ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
              )}
            />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">{t('acc.form.excludeToggle')}</span>
            <span className="block text-xs font-medium text-muted-foreground">
              {excludeFromStats ? t('acc.form.excludeHidden') : t('acc.form.excludeKeep')}
            </span>
          </span>
        </button>

        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </form>
    </Modal>
  )
}

