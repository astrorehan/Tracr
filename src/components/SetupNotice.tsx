import { Card } from './ui/Card'

export function SetupNotice() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6">
      <Card className="space-y-4">
        <h1 className="text-xl font-semibold">Finish setup</h1>
        <p className="text-sm text-muted-foreground">
          Supabase isn&apos;t configured yet. Create a project at{' '}
          <a className="text-primary underline" href="https://supabase.com" target="_blank">
            supabase.com
          </a>
          , then copy <code className="rounded bg-surface-muted px-1">.env.example</code> to{' '}
          <code className="rounded bg-surface-muted px-1">.env.local</code> and fill in:
        </p>
        <pre className="overflow-x-auto rounded-xl bg-surface-muted p-3 text-xs">
          {`VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...`}
        </pre>
        <p className="text-sm text-muted-foreground">
          Run the SQL in <code className="rounded bg-surface-muted px-1">supabase/migrations</code>{' '}
          and enable the Google auth provider. Then restart the dev server.
        </p>
      </Card>
    </div>
  )
}
