# Tracr

Aplikasi pencatatan keuangan berbasis web yang tetap berfungsi penuh **tanpa koneksi internet**.
Catat **banyak akun** dari jenis apa pun (tunai, kartu bank, dompet elektronik, kripto, saham,
kustom), catat pemasukan/pengeluaran/transfer, dan lihat saldo serta pengeluaran sekilas mata.
Bisa dipasang ke layar utama telepon genggam sebagai PWA — tanpa toko aplikasi.

Setiap perubahan yang dibuat saat luring (transaksi, akun, anggaran, utang, penjualan, dll.)
diantre di IndexedDB dan diputar ulang berurutan begitu koneksi kembali, lengkap dengan antrian
gagal yang terlihat pengguna bila ada yang tidak bisa disinkronkan (lihat
[Cara kerja mode luring](#cara-kerja-mode-luring)).

Ubah sebuah buku menjadi **Buku Usaha** (mode bisnis) untuk membuka kasir sederhana, utang-piutang
per kontak, dan laporan Laba Rugi — semuanya berbagi buku besar yang sama dengan buku pribadi.
Wawasan pengeluaran berbasis AI dan bot Telegram untuk mencatat transaksi lewat percakapan juga
tersedia (lihat [Roadmap](#roadmap)).

Live: **[tracr-ai.vercel.app](https://tracr-ai.vercel.app)**

## Konteks Veternity Beraksi 2026

Repositori ini adalah karya tim **IDUB mandus** untuk Web Development Competition **Veternity
Beraksi 2026**, sub tema **Micro-Capital Crowdfunding & Financial Management**. Proposal lengkap
(latar belakang masalah, arsitektur, use case, dan desain antarmuka) ada di
[`docs/veternity/VB2026_WebDev_IDUBmandus.md`](docs/veternity/VB2026_WebDev_IDUBmandus.md) —
salinan siap-cetaknya di
[`VB2026_WebDev_IDUBmandus.docx`](docs/veternity/VB2026_WebDev_IDUBmandus.docx). Repo ini tetap
publik selama masa penjurian sesuai ketentuan lomba.

Tiga hal di kode ini yang langsung menjawab tema besar *Bridging the Gap: Digital Platforms for
Equitable Economic Access* — dan alasannya ada di README ini, bukan dikarang di proposal:

- **Luring beneran, bukan cuma cache baca** → [Cara kerja mode luring](#cara-kerja-mode-luring)
- **Bahasa manusia, bukan istilah akuntansi** → kolom "Modal"/"Untung", "Pelanggan ngutang"/"Saya
  ngutang" di modul Buku Usaha (`src/features/debts`, `src/features/products`, `src/features/profit`)
- **Laporan Laba Rugi + ekspor PDF/CSV sebagai dokumen pendukung permodalan** →
  `src/app/ProfitPage.tsx`, `src/features/reports`

## Stack

- **Frontend:** Vite + React 19 + TypeScript, Tailwind CSS v4, TanStack Query, React Router 7
- **PWA & luring:** `vite-plugin-pwa` + Workbox (installable, offline shell); antrian mutasi
  berbasis IndexedDB dengan fallback `localStorage` untuk tulisan saat luring
  (`src/lib/offlineQueue.ts`)
- **Backend:** [Supabase](https://supabase.com) — Postgres + Row Level Security, Google OAuth,
  Storage (lampiran struk), Edge Functions (auto-post transaksi berulang, bot Telegram/WhatsApp,
  wawasan AI, billing), `pg_cron` untuk tugas terjadwal
- **Uang:** disimpan sebagai bilangan bulat **satuan terkecil** — tidak ada drift bilangan pecahan
- **Uji:** Vitest — 187 kasus di 17 berkas, memusat pada logika perhitungan uang

## Mulai cepat

### 1. Instal

```bash
npm install
```

### 2. Buat proyek Supabase

1. Buat proyek di [supabase.com](https://supabase.com).
2. Di **SQL Editor**, jalankan migrasi [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   Ini membuat tabel, view `account_balances`, kebijakan RLS, dan trigger yang menyemai profil +
   kategori bawaan saat pertama kali masuk.
3. **Authentication → Providers → Google:** aktifkan dan tempel klien OAuth Google (buat di
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials); atur redirect URI
   resmi ke `https://<project-ref-anda>.supabase.co/auth/v1/callback`).
4. **Authentication → URL Configuration:** tambahkan URL pengembangan `http://localhost:5173`
   (dan URL produksi nanti) ke daftar redirect yang diizinkan.

### 3. Atur environment

```bash
cp .env.example .env.local
```

Isi dari **Project Settings → API** (hanya anon key publik yang boleh masuk ke klien):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 4. Jalankan

```bash
npm run dev      # http://localhost:5173
npm run build    # type-check + build produksi ke dist/
npm run preview  # jalankan hasil build produksi
```

Bila variabel environment belum diisi, aplikasi menampilkan layar setup, bukan crash.

## Deploy

Semua static host bisa dipakai. Untuk **Vercel**: import repo, framework preset **Vite**,
tambahkan dua variabel `VITE_`, deploy. Lalu tambahkan domain produksi ke daftar redirect
Supabase.

## Pasang di telepon genggam (jadi "shortcut")

Buka URL yang sudah di-deploy di telepon → menu peramban → **Add to Home Screen** / **Tambahkan
ke Layar Utama**. Terbuka layar penuh seperti aplikasi native. (Aplikasi Android/iOS asli bisa
menyusul lewat Capacitor — SPA ini sudah siap dibungkus.)

## Struktur proyek

```
src/
  app/         # halaman rute (Dashboard, Accounts, Transactions, Products, Debts, Profit…)
  components/  # shell aplikasi + primitif UI (Button, Card, Input, Modal, States, OfflineBanner)
  features/    # dibagi per fitur: auth, accounts, categories, transactions, debts, products,
               # profit, sales, books, bot, billing, settings…
  lib/         # klien supabase, query client, util uang + mata uang, offlineQueue
  types/       # tipe baris DB yang mencerminkan skema SQL
supabase/
  migrations/  # SQL bernomor versi (skema, RLS, view saldo, trigger seed)
  functions/   # Edge Functions: recurring-autopost, tg-webhook, wa-webhook, send-push,
               # ai-analysis, billing-checkout, midtrans-webhook
docs/          # PROJECT_MAP.md (indeks arsitektur), FEATURES.md (backlog/roadmap),
               # veternity/ (proposal kompetisi)
```

Lihat [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) untuk indeks lengkap letak setiap bagian.

## Cara kerja perhitungan uang

Nominal disimpan sebagai bilangan bulat satuan terkecil (mis. sen; IDR 0 desimal, BTC 8 desimal).
Semua konversi lewat [`src/lib/money.ts`](src/lib/money.ts). Saldo akun dihitung **di sisi
server** oleh view SQL `account_balances` (saldo awal + mutasi bertanda, transfer mendebit akun
asal dan mengkredit akun tujuan), sehingga klien tidak pernah menghitung ulang uang.

Transfer lintas mata uang, konversi kurs, dan snapshot kurs per transaksi (`base_amount` +
`fx_rate`, dibekukan saat dibuat) sudah berjalan — lihat [`src/features/fx/`](src/features/fx).
Kekayaan bersih dan laporan masih dijumlahkan dalam mata uang dasar saja.

## Cara kerja mode luring

Tulisan yang dibuat saat luring (bukan cuma baca) lewat
[`src/lib/offlineQueue.ts`](src/lib/offlineQueue.ts):

1. Setiap mutasi luring (buat/ubah/hapus transaksi, akun, anggaran, utang, produk, penjualan,
   dan 30+ jenis lain) diantre ke IndexedDB, dengan fallback `localStorage` bila IndexedDB tidak
   tersedia.
2. Saat koneksi kembali, antrian diputar ulang **berurutan** (FIFO). Entitas yang dibuat saat
   luring memakai ID sementara yang dipetakan ulang ke UUID server asli begitu mutasi induknya
   berhasil (`remapQueuedTempIds`), sehingga mutasi turunan dalam sesi yang sama (mis. "jual
   produk yang baru dibuat saat luring") tidak putus.
3. Mutasi diulang maksimal 3 kali; setelah itu pindah ke **antrian gagal** yang bisa dilihat dan
   dicoba ulang pengguna ([`FailedSyncModal.tsx`](src/components/FailedSyncModal.tsx)) — tidak
   ada yang hilang diam-diam.
4. [`OfflineBanner.tsx`](src/components/OfflineBanner.tsx) selalu menampilkan status koneksi dan
   jumlah yang menunggu sinkron.

## Roadmap

Yang sudah dikirim melampaui MVP awal: dukungan multi-buku (pribadi + mode bisnis **Buku
Usaha**), POS-lite + Laba Rugi, utang-piutang dengan pengingat WhatsApp, FX/multi-mata uang,
cicilan, auto-post transaksi berulang, web push, antrian tulis luring penuh, wawasan pengeluaran
AI (diukur kredit), dan bot Telegram untuk mencatat transaksi lewat percakapan. Lihat
[docs/FEATURES.md](docs/FEATURES.md) untuk tabel status lengkap.

Masih terbuka:

- **Bot WhatsApp** — berbagi inti yang sama dengan bot Telegram; tertunda menunggu verifikasi
  akun bisnis Meta
- **Patungan tagihan** — lacak tagihan bersama; QRIS lewat agregator pembayaran setelah terdaftar
  (berbayar)
- **Ekspor Google Sheets** — dorong transaksi ke sheet milik pengguna
- **Aplikasi native** — bungkus SPA ini dengan Capacitor untuk Play Store / App Store
- Cakupan uji lebih luas, penghalusan legal/billing (lihat "Recommended build order" di
  docs/FEATURES.md)
