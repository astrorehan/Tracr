/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Web Push VAPID public key (optional; push UI hides itself when unset). */
  readonly VITE_VAPID_PUBLIC_KEY?: string
  /** Midtrans Snap client key — public by design (same trust level as the
   *  VAPID public key). Top-up buttons stay "coming soon" until this is set. */
  readonly VITE_MIDTRANS_CLIENT_KEY?: string
  /** 'true' once real (non-sandbox) Midtrans keys are in use. */
  readonly VITE_MIDTRANS_IS_PRODUCTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
