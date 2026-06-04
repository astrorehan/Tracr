import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LogOut,
  Moon,
  Sun,
  Sparkles,
  MessageCircle,
  Table,
  Split,
  Tag,
  Tags,
  Target,
  Receipt,
  PiggyBank,
  ChevronRight,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies'
import { useAuth } from '@/features/auth/useAuth'
import { useTheme } from '@/features/settings/theme-context'
import { useTextSize, TEXT_SIZES } from '@/features/settings/text-size-context'
import { DataCard } from '@/features/data/DataCard'
import { cn } from '@/lib/utils'

// Relative "A" preview sizes shown on each text-size step.
const A_PREVIEW = ['text-sm', 'text-base', 'text-lg', 'text-xl']

export function SettingsPage() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { theme, toggle } = useTheme()
  const { size, setSize } = useTextSize()
  const [saving, setSaving] = useState(false)
  const [base, setBase] = useState(profile?.base_currency ?? 'IDR')

  async function saveBaseCurrency(next: string) {
    setBase(next)
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({ base_currency: next }).eq('id', user.id)
    await refreshProfile()
    setSaving(false)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Settings</h1>

      {/* Profile */}
      <Card className="flex items-center gap-4 p-5 shadow-sm">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-14 w-14 rounded-2xl border border-border shadow-sm" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-xl font-bold text-primary shadow-inner">
            {(profile?.display_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-foreground leading-tight">{profile?.display_name ?? 'Account'}</p>
          <p className="truncate text-xs font-semibold text-muted-foreground mt-1">{user?.email}</p>
        </div>
      </Card>

      {/* Preferences */}
      <Card className="space-y-5 p-5 shadow-sm">
        <Field label="Base currency">
          <Select value={base} disabled={saving} onChange={(e) => saveBaseCurrency(e.target.value)} className="bg-surface-muted/40">
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code} — {CURRENCIES[code].name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex items-center justify-between pt-1">
          <span className="text-sm font-bold text-foreground">Appearance</span>
          <Button variant="secondary" size="sm" onClick={toggle} className="border border-border/50">
            {theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            {theme === 'dark' ? 'Dark' : 'Light'}
          </Button>
        </div>

        {/* Text size — accessibility */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">Text size</span>
            <span className="text-xs font-medium text-muted-foreground">Accessibility</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-surface-muted p-1.5">
            {TEXT_SIZES.map((s, i) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSize(s.value)}
                aria-pressed={size === s.value}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-lg py-2.5 transition-all duration-200',
                  size === s.value
                    ? 'bg-surface text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className={cn('font-display font-black leading-none', A_PREVIEW[i])}>A</span>
                <span className="text-[11px] font-semibold">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Manage categories & tags */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/categories">
          <Card hoverable className="flex items-center gap-3.5 p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10">
              <Tag className="h-5 w-5" />
            </div>
            <span className="flex-1 text-sm font-bold text-foreground">Manage categories</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
        </Link>

        <Link to="/tags">
          <Card hoverable className="flex items-center gap-3.5 p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/10">
              <Tags className="h-5 w-5" />
            </div>
            <span className="flex-1 text-sm font-bold text-foreground">Manage tags</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
        </Link>

        <Link to="/budgets">
          <Card hoverable className="flex items-center gap-3.5 p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10">
              <Target className="h-5 w-5" />
            </div>
            <span className="flex-1 text-sm font-bold text-foreground">Manage budgets</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
        </Link>

        <Link to="/bills">
          <Card hoverable className="flex items-center gap-3.5 p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/10">
              <Receipt className="h-5 w-5" />
            </div>
            <span className="flex-1 text-sm font-bold text-foreground">Bills &amp; subscriptions</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
        </Link>

        <Link to="/goals">
          <Card hoverable className="flex items-center gap-3.5 p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/10">
              <PiggyBank className="h-5 w-5" />
            </div>
            <span className="flex-1 text-sm font-bold text-foreground">Savings goals</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
        </Link>
      </div>

      {/* Data: CSV export / import */}
      <DataCard />

      {/* Roadmap */}
      <div className="space-y-2">
        <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Coming soon</p>
        <Card className="divide-y divide-border/60 py-1 px-5 shadow-sm">
          {[
            { icon: Sparkles, label: 'AI spending insights', color: 'text-yellow-500 bg-yellow-500/10' },
            { icon: MessageCircle, label: 'Log via WhatsApp bot', color: 'text-green-500 bg-green-500/10' },
            { icon: Split, label: 'Split bills with friends', color: 'text-pink-500 bg-pink-500/10' },
            { icon: Table, label: 'Export to Google Sheets', color: 'text-teal-500 bg-teal-500/10' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex items-center gap-3.5 py-3 text-sm font-semibold text-muted-foreground">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border border-transparent", color)}>
                <Icon className="h-4 w-4" />
              </div>
              <span>{label}</span>
            </div>
          ))}
        </Card>
      </div>

      <Button variant="outline" className="w-full border-border/80 hover:bg-danger/5 hover:text-danger hover:border-danger/20 transition-all font-bold" onClick={() => signOut()}>
        <LogOut className="h-4 w-4" /> Sign out
      </Button>

      <p className="pb-4 text-center text-[10px] font-bold tracking-wider text-muted-foreground">Tracr · v0.1</p>
    </div>
  )
}
