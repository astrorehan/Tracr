import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select, Label } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import type { Account, Category } from '@/types/db'
import {
  FIELD_LABELS,
  TARGET_FIELDS,
  detectAmountSign,
  detectMapping,
  loadPreset,
  parseMappedCsv,
  savePreset,
  type AmountSign,
  type ImportConfig,
  type ParsedFile,
  type TargetField,
} from './csvImport'
import { useImportTransactions } from './api'
import type { ImportResult } from './transactionsCsv'

interface CsvImportWizardProps {
  /** The parsed file to import; the wizard is shown whenever this is set. */
  file: ParsedFile | null
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  defaultCurrency: string
}

const SIGN_OPTIONS: { value: AmountSign; label: string; hint: string }[] = [
  { value: 'type-column', label: 'Type column', hint: 'A column says income / expense (or debit / credit).' },
  { value: 'signed', label: '+ / − amount', hint: 'Negative amounts are expenses, positive are income.' },
  { value: 'all-expense', label: 'All expenses', hint: 'Every row is an expense (e.g. a card statement).' },
]

/** Fields that always need a value (account can fall back to a default). */
const REQUIRED: TargetField[] = ['date', 'amount']

/**
 * Column-mapping import wizard. The user maps their file's columns onto Tracr
 * fields, picks how income vs expense is expressed, then previews the result
 * before committing. Mappings are remembered per header signature so repeat
 * imports of the same statement are one click.
 */
export function CsvImportWizard(props: CsvImportWizardProps) {
  // Re-mount the inner wizard per file so its state initializes cleanly.
  return (
    <Modal open={Boolean(props.file)} onClose={props.onClose} title="Import CSV">
      {props.file && <WizardBody key={props.file.headers.join('|')} {...props} file={props.file} />}
    </Modal>
  )
}

function WizardBody({
  file,
  onClose,
  accounts,
  categories,
  defaultCurrency,
}: CsvImportWizardProps & { file: ParsedFile }) {
  const importMut = useImportTransactions()

  const [config, setConfig] = useState<ImportConfig>(() => {
    const detected = detectMapping(file.headers)
    const preset = loadPreset(file.headers)
    const mapping = preset?.mapping ?? detected
    return {
      mapping,
      amountSign: preset?.amountSign ?? detectAmountSign(detected),
      defaultAccountId: mapping.account !== null ? null : (accounts[0]?.id ?? null),
      defaultCurrency,
    }
  })
  const [step, setStep] = useState<'map' | 'preview'>('map')
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [imported, setImported] = useState<number | null>(null)

  const headerOptions = useMemo(
    () => file.headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })),
    [file.headers],
  )

  // Account is satisfied either by a mapped column or a chosen default.
  const accountReady = config.mapping.account !== null || Boolean(config.defaultAccountId)
  const missing = REQUIRED.filter((f) => config.mapping[f] === null)
  const canPreview = missing.length === 0 && accountReady

  function setField(field: TargetField, value: string) {
    setConfig((c) => ({
      ...c,
      mapping: { ...c.mapping, [field]: value === '' ? null : Number(value) },
    }))
  }

  function runPreview() {
    savePreset(file.headers, { mapping: config.mapping, amountSign: config.amountSign })
    setPreview(parseMappedCsv(file, config, accounts, categories))
    setStep('preview')
  }

  async function confirmImport() {
    if (!preview) return
    try {
      const n = await importMut.mutateAsync(preview.valid)
      setImported(n)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  if (imported !== null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          Imported <span className="font-semibold text-primary">{imported}</span> transaction(s).
        </p>
        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    )
  }

  if (step === 'preview' && preview) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-surface-muted p-3 text-sm">
          <p>
            <span className="font-semibold text-primary">{preview.valid.length}</span> valid row(s)
            ready to import.
          </p>
          {preview.errors.length > 0 && (
            <p className="text-muted-foreground">
              <span className="font-semibold text-danger">{preview.errors.length}</span> row(s)
              skipped.
            </p>
          )}
        </div>

        {preview.errors.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-xl border border-border p-3 text-xs">
            {preview.errors.slice(0, 50).map((err, i) => (
              <p key={i} className="text-muted-foreground">
                Line {err.line}: {err.message}
              </p>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setStep('map')}>
            Back
          </Button>
          <Button
            className="flex-1"
            loading={importMut.isPending}
            disabled={preview.valid.length === 0}
            onClick={confirmImport}
          >
            Import {preview.valid.length}
          </Button>
        </div>
      </div>
    )
  }

  const activeSign = SIGN_OPTIONS.find((o) => o.value === config.amountSign)

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Found <span className="font-semibold text-foreground">{file.rows.length}</span> row(s).
        Match your columns to Tracr’s fields.
      </p>

      {/* How income vs expense is expressed */}
      <div>
        <Label>How are income &amp; expense shown?</Label>
        <Segmented
          value={config.amountSign}
          onChange={(v) => setConfig((c) => ({ ...c, amountSign: v }))}
          options={SIGN_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          aria-label="Amount sign convention"
          className="w-full"
        />
        {activeSign && <p className="mt-1.5 text-xs text-muted-foreground">{activeSign.hint}</p>}
      </div>

      {/* Column mapping */}
      <div className="space-y-3">
        {TARGET_FIELDS.map((field) => {
          // Hide fields irrelevant to the chosen sign mode.
          if (field === 'type' && config.amountSign !== 'type-column') return null
          const isRequired = REQUIRED.includes(field)
          return (
            <div key={field} className="flex items-center gap-3">
              <Label className="mb-0 w-36 shrink-0 text-sm">
                {FIELD_LABELS[field]}
                {isRequired && <span className="text-danger"> *</span>}
              </Label>
              <Select
                className="h-10 flex-1"
                value={config.mapping[field] === null ? '' : String(config.mapping[field])}
                onChange={(e) => setField(field, e.target.value)}
              >
                <option value="">— Not mapped —</option>
                {headerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
          )
        })}
      </div>

      {/* Default account when no account column is mapped */}
      {config.mapping.account === null && (
        <div>
          <Label>Default account</Label>
          <Select
            value={config.defaultAccountId ?? ''}
            onChange={(e) =>
              setConfig((c) => ({ ...c, defaultAccountId: e.target.value || null }))
            }
          >
            <option value="">— Choose an account —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Used for every row, since no account column is mapped.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button className="flex-1" disabled={!canPreview} onClick={runPreview}>
          Preview
        </Button>
      </div>
      {!canPreview && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Map {missing.length > 0 ? missing.map((f) => FIELD_LABELS[f]).join(', ') : ''}
          {missing.length > 0 && !accountReady ? ' and ' : ''}
          {!accountReady ? 'an account' : ''} to continue.
        </p>
      )}
    </div>
  )
}
