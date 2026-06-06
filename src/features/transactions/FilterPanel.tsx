import { useMemo, useState } from 'react'
import { Bookmark, Check, Search, SlidersHorizontal, X } from 'lucide-react'
import { Select } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { indexById } from '@/lib/collections'
import { flattenWithDepth } from '@/features/categories/tree'
import type { Account, Category, Tag } from '@/types/db'
import {
  activeFilterCount,
  DATE_PRESETS,
  isFilterEmpty,
  SORT_OPTIONS,
  SOURCE_OPTIONS,
  defaultFilter,
  type TxFilter,
} from './filters'
import { useSavedViews } from './savedViews'
import { usePayees } from './api'

interface Props {
  filter: TxFilter
  onChange: (next: TxFilter) => void
  accounts: Account[]
  categories: Category[]
  tags: Tag[]
}

export function FilterPanel({ filter, onChange, accounts, categories, tags }: Props) {
  const { data: payeeSuggestions = [] } = usePayees()
  const [open, setOpen] = useState(false)
  const { views, save, remove } = useSavedViews()
  const count = activeFilterCount(filter)

  const accountMap = useMemo(() => indexById(accounts), [accounts])
  const categoryMap = useMemo(() => indexById(categories), [categories])
  const tagMap = useMemo(() => indexById(tags), [tags])

  const categoryOptions = useMemo(
    () =>
      flattenWithDepth(
        (filter.type === 'income' || filter.type === 'expense'
          ? categories.filter((c) => c.kind === filter.type)
          : categories
        ).filter((c) => !c.is_archived),
      ),
    [categories, filter.type],
  )

  function set<K extends keyof TxFilter>(key: K, value: TxFilter[K]) {
    onChange({ ...filter, [key]: value })
  }
  function toggleTag(id: string) {
    set('tagIds', filter.tagIds.includes(id) ? filter.tagIds.filter((t) => t !== id) : [...filter.tagIds, id])
  }

  function handleSaveView() {
    const name = window.prompt('Name this view')?.trim()
    if (name) save(name, filter)
  }

  const serialized = JSON.stringify(filter)

  // Compact "what's applied" chips with individual removal.
  const chips: { key: string; label: string; onRemove: () => void }[] = []
  if (filter.datePreset !== 'all')
    chips.push({
      key: 'date',
      label: DATE_PRESETS.find((p) => p.value === filter.datePreset)?.label ?? 'Date',
      onRemove: () => onChange({ ...filter, datePreset: 'all', customFrom: '', customTo: '' }),
    })
  if (filter.accountId)
    chips.push({
      key: 'account',
      label: accountMap[filter.accountId]?.name ?? 'Account',
      onRemove: () => set('accountId', ''),
    })
  if (filter.type)
    chips.push({
      key: 'type',
      label: filter.type[0].toUpperCase() + filter.type.slice(1),
      onRemove: () => set('type', ''),
    })
  if (filter.categoryId)
    chips.push({
      key: 'category',
      label: categoryMap[filter.categoryId]?.name ?? 'Category',
      onRemove: () => set('categoryId', ''),
    })
  for (const id of filter.tagIds)
    chips.push({
      key: `tag-${id}`,
      label: `#${tagMap[id]?.name ?? 'tag'}`,
      onRemove: () => toggleTag(id),
    })
  if (filter.amountMin || filter.amountMax)
    chips.push({
      key: 'amount',
      label: `${filter.amountMin || '0'} – ${filter.amountMax || '∞'}`,
      onRemove: () => onChange({ ...filter, amountMin: '', amountMax: '' }),
    })
  if (filter.payee.trim())
    chips.push({
      key: 'payee',
      label: filter.payee.trim(),
      onRemove: () => set('payee', ''),
    })
  if (filter.source)
    chips.push({
      key: 'source',
      label: SOURCE_OPTIONS.find((s) => s.value === filter.source)?.label ?? 'Source',
      onRemove: () => set('source', ''),
    })

  return (
    <div className="sticky top-[80px] z-10 space-y-3 rounded-2xl border border-border bg-surface/95 p-4 shadow-sm backdrop-blur-xl">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={filter.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search notes, payees, categories, accounts, tags…"
          className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-4 text-sm text-foreground shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
        />
      </div>

      {/* Always-visible controls: date preset · sort · advanced toggle */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Select
          value={filter.datePreset}
          onChange={(e) => set('datePreset', e.target.value as TxFilter['datePreset'])}
          className="bg-surface"
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select
          value={filter.sort}
          onChange={(e) => set('sort', e.target.value as TxFilter['sort'])}
          className="bg-surface"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition-all sm:col-span-1',
            open || count > 0
              ? 'border-primary/60 bg-primary/10 text-primary'
              : 'border-border bg-surface text-foreground hover:bg-surface-muted',
          )}
          aria-expanded={open}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {count > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
              {count}
            </span>
          )}
        </button>
      </div>

      {/* Advanced panel */}
      {open && (
        <div className="space-y-4 rounded-xl border border-border bg-surface-muted/50 p-4">
          {filter.datePreset === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">From</span>
                <input
                  type="date"
                  value={filter.customFrom}
                  onChange={(e) => set('customFrom', e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground shadow-sm focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">To</span>
                <input
                  type="date"
                  value={filter.customTo}
                  onChange={(e) => set('customTo', e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground shadow-sm focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select value={filter.accountId} onChange={(e) => set('accountId', e.target.value)} className="bg-surface">
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select
              value={filter.type}
              onChange={(e) => set('type', e.target.value as TxFilter['type'])}
              className="bg-surface"
            >
              <option value="">All types</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </Select>
            <Select
              value={filter.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
              className="bg-surface"
            >
              <option value="">All categories</option>
              {categoryOptions.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {depth ? '  — ' : ''}
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              value={filter.source}
              onChange={(e) => set('source', e.target.value as TxFilter['source'])}
              className="bg-surface"
            >
              <option value="">Any source</option>
              {SOURCE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Amount range */}
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              inputMode="decimal"
              value={filter.amountMin}
              onChange={(e) => set('amountMin', e.target.value)}
              placeholder="Min amount"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground shadow-sm focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            />
            <input
              type="number"
              inputMode="decimal"
              value={filter.amountMax}
              onChange={(e) => set('amountMax', e.target.value)}
              placeholder="Max amount"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground shadow-sm focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            />
          </div>

          {/* Payee */}
          <div>
            <input
              list="payee-filter-suggestions"
              value={filter.payee}
              onChange={(e) => set('payee', e.target.value)}
              placeholder="Payee / merchant"
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground shadow-sm focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            />
            <datalist id="payee-filter-suggestions">
              {payeeSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Tags</span>
                {filter.tagIds.length > 1 && (
                  <div className="inline-flex overflow-hidden rounded-lg border border-border text-[11px] font-semibold">
                    {(['any', 'all'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set('tagMatch', m)}
                        className={cn(
                          'px-2.5 py-1 transition',
                          filter.tagMatch === m
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-surface text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {m === 'any' ? 'Match any' : 'Match all'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const active = filter.tagIds.includes(t.id)
                  const color = t.color ?? '#64748b'
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => toggleTag(t.id)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-sm font-medium transition',
                        active ? 'text-white' : 'text-foreground hover:bg-surface-muted',
                      )}
                      style={
                        active
                          ? { backgroundColor: color, borderColor: color }
                          : { borderColor: 'var(--border)' }
                      }
                      aria-pressed={active}
                    >
                      {t.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Saved views */}
      {(views.length > 0 || !isFilterEmpty(filter)) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
          {views.map((v) => {
            const matches = JSON.stringify(v.filter) === serialized
            return (
              <span
                key={v.id}
                className={cn(
                  'group inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1.5 text-xs font-semibold transition',
                  matches
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border bg-surface text-foreground hover:bg-surface-muted',
                )}
              >
                <button type="button" onClick={() => onChange(v.filter)} className="cursor-pointer">
                  {matches && <Check className="mr-1 inline h-3 w-3" />}
                  {v.name}
                </button>
                <button
                  type="button"
                  onClick={() => remove(v.id)}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-danger"
                  aria-label={`Delete view ${v.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
          {!isFilterEmpty(filter) && (
            <button
              type="button"
              onClick={handleSaveView}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary/60 hover:text-primary"
            >
              <Bookmark className="h-3 w-3" />
              Save view
            </button>
          )}
        </div>
      )}

      {/* Active filter chips */}
      {(chips.length > 0 || !isFilterEmpty(filter)) && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1 rounded-full bg-surface-muted py-1 pl-3 pr-1.5 text-xs font-medium text-foreground"
            >
              {c.label}
              <button
                type="button"
                onClick={c.onRemove}
                className="rounded-full p-0.5 text-muted-foreground hover:text-danger"
                aria-label={`Remove ${c.label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {!isFilterEmpty(filter) && (
            <button
              type="button"
              onClick={() => onChange(defaultFilter)}
              className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
