import { Link, useParams, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface Section {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}
interface LegalDoc {
  title: string
  updated: string
  intro: string
  sections: Section[]
}

const UPDATED = '16 June 2026'
const CONTACT = 'support@tracr.app'

const TERMS: LegalDoc = {
  title: 'Terms of Service',
  updated: UPDATED,
  intro:
    'These terms govern your use of Tracr, a personal finance tracker. By creating an account or using the app, you agree to them. If you don’t agree, please don’t use Tracr.',
  sections: [
    {
      heading: '1. The service',
      paragraphs: [
        'Tracr lets you record accounts, transactions, budgets, bills, goals and related notes for your own personal money management. It is a record-keeping tool — nothing more.',
      ],
    },
    {
      heading: '2. Not financial advice',
      paragraphs: [
        'Tracr does not provide financial, investment, tax, accounting or legal advice. Charts, projections and totals are informational summaries of the data you enter and may contain errors. Decisions you make based on them are your own responsibility.',
      ],
    },
    {
      heading: '3. Your account',
      paragraphs: [
        'You sign in with Google. You are responsible for keeping access to that Google account secure and for all activity under your Tracr account. You must be old enough to form a binding contract in your country to use Tracr.',
      ],
    },
    {
      heading: '4. Acceptable use',
      paragraphs: ['You agree not to:'],
      bullets: [
        'break the law or infringe anyone’s rights while using Tracr;',
        'attempt to access other users’ data or disrupt the service;',
        'probe, scan, or reverse-engineer the service except as permitted by law;',
        'resell or redistribute the service without our written permission.',
      ],
    },
    {
      heading: '5. Your data',
      paragraphs: [
        'You own the financial data you put into Tracr. You can export everything at any time from Settings → Data & backup, and you can permanently delete your account and all of its data from Settings. See our Privacy Policy for how we handle your data.',
      ],
    },
    {
      heading: '6. Availability and changes',
      paragraphs: [
        'We may add, change, or remove features, and we may suspend or discontinue the service. We’ll try to give reasonable notice of material changes, but the service is provided on an “as available” basis and we don’t guarantee uninterrupted access.',
      ],
    },
    {
      heading: '7. Disclaimers and liability',
      paragraphs: [
        'The service is provided “as is” without warranties of any kind, to the fullest extent permitted by law. To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential losses, or for any loss of data or profits, arising from your use of Tracr.',
      ],
    },
    {
      heading: '8. Termination',
      paragraphs: [
        'You can stop using Tracr and delete your account at any time. We may suspend or terminate access if you breach these terms or to protect the service or other users.',
      ],
    },
    {
      heading: '9. Changes to these terms',
      paragraphs: [
        'We may update these terms from time to time. When we do, we’ll change the “last updated” date above. Continuing to use Tracr after a change means you accept the revised terms.',
      ],
    },
    {
      heading: '10. Contact',
      paragraphs: [`Questions about these terms? Email ${CONTACT}.`],
    },
  ],
}

const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: UPDATED,
  intro:
    'This policy explains what Tracr collects, how it’s used, and the control you have over it. Your financial data is private to your account and is never sold.',
  sections: [
    {
      heading: '1. What we collect',
      paragraphs: ['We keep this minimal:'],
      bullets: [
        'Account basics from Google sign-in: your name, email address and profile picture.',
        'The data you enter: accounts, transactions, categories, tags, budgets, bills, goals, rules, exchange rates and any notes or receipts you attach.',
        'Basic technical data needed to run the app, such as your session and saved preferences (theme, text size, saved filters), stored in your browser.',
      ],
    },
    {
      heading: '2. How we use it',
      paragraphs: [
        'We use your data only to provide Tracr: to authenticate you, store and display your records, compute your reports and net worth, and keep your preferences. We do not use your financial data for advertising and we do not sell it.',
      ],
    },
    {
      heading: '3. Where it’s stored',
      paragraphs: [
        'Your data is stored in our database hosted on Supabase. Every table is protected by row-level security so each user can only read or write their own rows. Receipts are kept in a private storage bucket scoped to your account. Data is encrypted in transit (HTTPS).',
      ],
    },
    {
      heading: '4. Who else is involved',
      paragraphs: ['We rely on a small number of service providers (sub-processors) to run Tracr:'],
      bullets: [
        'Google — sign-in / authentication.',
        'Supabase — database, authentication and file storage.',
        'Exchange-rate sources used to convert currencies (open.er-api.com and CoinGecko); we send currency codes to fetch rates, never your financial data.',
      ],
    },
    {
      heading: '5. Your rights and controls',
      paragraphs: ['You stay in control of your data:'],
      bullets: [
        'Access & export — download everything as JSON or CSV from Settings → Data & backup.',
        'Correction — edit or delete any record directly in the app.',
        'Deletion — permanently delete your account and all associated data from Settings; this is immediate and irreversible.',
      ],
    },
    {
      heading: '6. Data retention',
      paragraphs: [
        'We keep your data for as long as your account exists. When you delete your account, your records are removed from the database. Backups you downloaded yourself remain on your own devices until you delete them.',
      ],
    },
    {
      heading: '7. Children',
      paragraphs: [
        'Tracr is not directed at children. Don’t use it if you’re below the age of digital consent in your country.',
      ],
    },
    {
      heading: '8. Changes to this policy',
      paragraphs: [
        'If we change this policy we’ll update the “last updated” date above and, for material changes, surface a notice in the app.',
      ],
    },
    {
      heading: '9. Contact',
      paragraphs: [`Questions or requests about your data? Email ${CONTACT}.`],
    },
  ],
}

const DOCS: Record<string, LegalDoc> = { terms: TERMS, privacy: PRIVACY }

export function LegalPage() {
  const { doc } = useParams<{ doc: string }>()
  const content = doc ? DOCS[doc] : undefined
  if (!content) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link
          to="/settings"
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <h1 className="section-head text-3xl text-foreground">{content.title}</h1>
        <p className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Last updated {content.updated}
        </p>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{content.intro}</p>

        <div className="mt-8 space-y-7">
          {content.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-base font-bold text-foreground">{s.heading}</h2>
              {s.paragraphs?.map((p, i) => (
                <p key={i} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-2 space-y-1.5 pl-1">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-12 flex gap-4 border-t border-border pt-6 text-sm font-semibold">
          <Link to="/legal/terms" className="text-muted-foreground hover:text-foreground">
            Terms
          </Link>
          <Link to="/legal/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy
          </Link>
        </div>
      </div>
    </div>
  )
}
