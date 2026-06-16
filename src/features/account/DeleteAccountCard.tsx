import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, HardDriveDownload } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { useDeleteAccount } from './api'

const CONFIRM_WORD = 'DELETE'

/** Danger-zone card: permanently delete the account after a typed confirmation. */
export function DeleteAccountCard() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const del = useDeleteAccount()

  function close() {
    if (del.isPending) return
    setOpen(false)
    setTyped('')
    setError(null)
  }

  async function confirm() {
    setError(null)
    try {
      await del.mutateAsync()
      // On success the auth listener redirects to /login; nothing more to do.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your account. Please try again.')
    }
  }

  return (
    <>
      <Card className="space-y-3 border-danger/30 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger ring-1 ring-danger/20">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Delete account</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Permanently erase your account and every record — accounts, transactions, budgets,
              bills, goals and receipts. This cannot be undone.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full border-danger/30 font-bold text-danger hover:bg-danger/5 hover:border-danger/40"
          onClick={() => setOpen(true)}
        >
          Delete my account
        </Button>
      </Card>

      <Modal open={open} onClose={close} title="Delete account">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            This permanently deletes your account and all of your data. There is no recovery and no
            backup kept on our side.
          </p>

          <Link
            to="/data"
            className="flex items-center gap-2 rounded-xl bg-surface-muted px-3.5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted/70"
          >
            <HardDriveDownload className="h-4 w-4 shrink-0 text-muted-foreground" />
            Download a backup first
          </Link>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Type <span className="font-bold text-danger">{CONFIRM_WORD}</span> to confirm
            </label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={close} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-danger text-white hover:brightness-110"
              loading={del.isPending}
              disabled={typed.trim().toUpperCase() !== CONFIRM_WORD}
              onClick={confirm}
            >
              Delete forever
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
