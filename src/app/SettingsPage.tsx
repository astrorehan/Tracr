import { useState, type ComponentType } from 'react'
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
  Zap,
  Target,
  Receipt,
  PiggyBank,
  Coins,
  Database,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Input'
import { PageHeader, Section, ListCard, ListRow, IconChip } from '@/components/ui/list'
import { supabase } from '@/lib/supabase'
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies'
import { LANGS, type Lang, type MsgKey } from '@/i18n'
import { useAuth } from '@/features/auth/useAuth'
import { useTheme } from '@/features/settings/theme-context'
import { useT } from '@/features/settings/language-context'
import { useTextSize, TEXT_SIZES, type TextSize } from '@/features/settings/text-size-context'
import { DeleteAccountCard } from '@/features/account/DeleteAccountCard'
import { cn } from '@/lib/utils'

// Relative "A" preview sizes shown on each text-size step.
const A_PREVIEW = ['text-sm', 'text-base', 'text-lg', 'text-xl']

const SIZE_LABELS: Record<TextSize, MsgKey> = {
  sm: 'settings.size.sm',
  md: 'settings.size.md',
  lg: 'settings.size.lg',
  xl: 'settings.size.xl',
}

interface NavItem {
  to: string
  label: MsgKey
  desc: MsgKey
  icon: ComponentType<{ className?: string }>
}

const ORGANIZE: NavItem[] = [
  { to: '/categories', label: 'section.categories', desc: 'settings.categoriesDesc', icon: Tag },
  { to: '/tags', label: 'section.tags', desc: 'settings.tagsDesc', icon: Tags },
  { to: '/rules', label: 'settings.rules', desc: 'settings.rulesDesc', icon: Zap },
]

const PLANNING: NavItem[] = [
  { to: '/budgets', label: 'nav.budgets', desc: 'settings.budgetsDesc', icon: Target },
  { to: '/bills', label: 'nav.bills', desc: 'settings.billsDesc', icon: Receipt },
  { to: '/goals', label: 'section.savingsGoals', desc: 'settings.goalsDesc', icon: PiggyBank },
]

const SYSTEM: NavItem[] = [
  {
    to: '/currencies',
    label: 'settings.exchangeRates',
    desc: 'settings.exchangeRatesDesc',
    icon: Coins,
  },
  { to: '/data', label: 'section.dataBackup', desc: 'settings.dataBackupDesc', icon: Database },
]

const COMING_SOON: { icon: ComponentType<{ className?: string }>; label: MsgKey }[] = [
  { icon: Sparkles, label: 'settings.soonAI' },
  { icon: MessageCircle, label: 'settings.soonWhatsApp' },
  { icon: Split, label: 'settings.soonSplit' },
  { icon: Table, label: 'settings.soonSheets' },
]

export function SettingsPage() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { theme, toggle } = useTheme()
  const { size, setSize } = useTextSize()
  const { t, lang, setLang } = useT()
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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('nav.settings')} />

      {/* Profile */}
      <Card className="flex items-center gap-4 p-5">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="h-14 w-14 rounded-2xl border border-border shadow-sm"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary-soft text-xl font-bold text-primary">
            {(profile?.display_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight text-foreground">
            {profile?.display_name ?? t('settings.accountFallback')}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{user?.email}</p>
        </div>
      </Card>

      {/* Preferences */}
      <Section title={t('settings.preferences')}>
        <Card className="space-y-5 p-5">
          <Field label={t('settings.language')}>
            <Select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="bg-surface-muted/40"
            >
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('settings.baseCurrency')}>
            <Select
              value={base}
              disabled={saving}
              onChange={(e) => saveBaseCurrency(e.target.value)}
              className="bg-surface-muted/40"
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code} — {CURRENCIES[code].name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-bold text-foreground">{t('settings.appearance')}</span>
            <Button variant="secondary" size="sm" onClick={toggle} className="border border-border/50">
              {theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              {theme === 'dark' ? t('settings.dark') : t('settings.light')}
            </Button>
          </div>

          {/* Text size — accessibility */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">{t('settings.textSize')}</span>
              <span className="text-xs font-medium text-muted-foreground">
                {t('settings.accessibility')}
              </span>
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
                  <span className="text-xs font-semibold">{t(SIZE_LABELS[s.value])}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>
      </Section>

      {/* Organize */}
      <Section title={t('settings.organize')}>
        <ListCard>
          {ORGANIZE.map((item) => (
            <NavRow key={item.to} {...item} />
          ))}
        </ListCard>
      </Section>

      {/* Planning */}
      <Section title={t('settings.planning')}>
        <ListCard>
          {PLANNING.map((item) => (
            <NavRow key={item.to} {...item} />
          ))}
        </ListCard>
      </Section>

      {/* Currency & data */}
      <Section title={t('settings.currencyData')}>
        <ListCard>
          {SYSTEM.map((item) => (
            <NavRow key={item.to} {...item} />
          ))}
        </ListCard>
      </Section>

      {/* Roadmap */}
      <Section title={t('settings.comingSoon')}>
        <ListCard>
          {COMING_SOON.map(({ icon: Icon, label }) => (
            <ListRow
              key={label}
              leading={<IconChip icon={Icon} plain />}
              title={<span className="text-muted-foreground">{t(label)}</span>}
            />
          ))}
        </ListCard>
      </Section>

      {/* Account */}
      <Section title={t('settings.accountSection')}>
        <DeleteAccountCard />
      </Section>

      <Button
        variant="outline"
        className="w-full border-border/80 font-bold transition-all hover:border-danger/20 hover:bg-danger/5 hover:text-danger"
        onClick={() => signOut()}
      >
        <LogOut className="h-4 w-4" /> {t('settings.signOut')}
      </Button>

      <div className="flex items-center justify-center gap-4 text-xs font-semibold text-muted-foreground">
        <Link to="/legal/terms" className="hover:text-foreground">
          {t('settings.terms')}
        </Link>
        <span aria-hidden className="text-border">
          ·
        </span>
        <Link to="/legal/privacy" className="hover:text-foreground">
          {t('settings.privacy')}
        </Link>
      </div>

      <p className="pb-4 text-center text-xs font-bold tracking-wider text-muted-foreground">
        Tracr · v0.1
      </p>
    </div>
  )
}

function NavRow({ to, label, desc, icon }: NavItem) {
  const { t } = useT()
  return (
    <ListRow
      to={to}
      leading={<IconChip icon={icon} plain className="text-foreground" />}
      title={t(label)}
      subtitle={t(desc)}
    />
  )
}
