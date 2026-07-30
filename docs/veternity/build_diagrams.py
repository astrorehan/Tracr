# -*- coding: utf-8 -*-
"""Render the four proposal diagrams as print-quality PNGs (Pillow only)."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = r"D:\FinancialTracker\docs\veternity\img"
os.makedirs(OUT, exist_ok=True)

TIMES = r"C:\Windows\Fonts\times.ttf"
TIMESBD = r"C:\Windows\Fonts\timesbd.ttf"
TIMESI = r"C:\Windows\Fonts\timesi.ttf"

INK = (24, 28, 34)
LINE = (90, 100, 112)
SOFT = (238, 242, 246)
SOFT2 = (226, 234, 242)
ACCENT = (0, 114, 188)
ACCENT_BG = (232, 243, 251)
WARN_BG = (253, 243, 232)
OK_BG = (233, 246, 238)
WHITE = (255, 255, 255)


def F(size, bold=False, italic=False):
    path = TIMESBD if bold else (TIMESI if italic else TIMES)
    return ImageFont.truetype(path, size)


def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def ctext(d, cx, cy, text, font, fill=INK, max_w=None, lh=1.25):
    lines = wrap(d, text, font, max_w) if max_w else text.split("\n")
    asc, desc = font.getmetrics()
    step = int((asc + desc) * lh)
    y = cy - step * len(lines) / 2
    for ln in lines:
        d.text((cx - d.textlength(ln, font=font) / 2, y), ln, font=font, fill=fill)
        y += step


def box(d, x, y, w, h, title=None, body=None, fill=SOFT, border=LINE, r=14,
        tfont=None, bfont=None, tcolor=INK, bcolor=INK, width=2):
    d.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=fill, outline=border, width=width)
    tfont = tfont or F(26, True)
    bfont = bfont or F(23)
    pad = 18
    if title and body:
        tl = wrap(d, title, tfont, w - 2 * pad)
        bl = wrap(d, body, bfont, w - 2 * pad)
        ta, td = tfont.getmetrics()
        ba, bd = bfont.getmetrics()
        tstep, bstep = int((ta + td) * 1.2), int((ba + bd) * 1.2)
        total = tstep * len(tl) + 8 + bstep * len(bl)
        yy = y + (h - total) / 2
        for ln in tl:
            d.text((x + w / 2 - d.textlength(ln, font=tfont) / 2, yy), ln, font=tfont, fill=tcolor)
            yy += tstep
        yy += 8
        for ln in bl:
            d.text((x + w / 2 - d.textlength(ln, font=bfont) / 2, yy), ln, font=bfont, fill=bcolor)
            yy += bstep
    else:
        ctext(d, x + w / 2, y + h / 2, title or body, tfont if title else bfont,
              tcolor if title else bcolor, w - 2 * pad)


def arrow(d, p1, p2, color=LINE, width=3, head=14, dashed=False):
    x1, y1 = p1
    x2, y2 = p2
    if dashed:
        import math
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy)
        n = max(int(L / 22), 1)
        for i in range(n):
            if i % 2:
                continue
            a = (x1 + dx * i / n, y1 + dy * i / n)
            b = (x1 + dx * (i + 1) / n, y1 + dy * (i + 1) / n)
            d.line([a, b], fill=color, width=width)
    else:
        d.line([p1, p2], fill=color, width=width)
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    for s in (0.5, -0.5):
        d.line([(x2, y2), (x2 - head * math.cos(ang - s), y2 - head * math.sin(ang - s))],
               fill=color, width=width)


def label(d, cx, cy, text, font=None, fill=INK, bg=WHITE):
    font = font or F(21, italic=True)
    w = d.textlength(text, font=font)
    a, de = font.getmetrics()
    d.rectangle([cx - w / 2 - 8, cy - (a + de) / 2 - 3, cx + w / 2 + 8, cy + (a + de) / 2 + 3], fill=bg)
    d.text((cx - w / 2, cy - (a + de) / 2), text, font=font, fill=fill)


def group(d, x, y, w, h, title):
    d.rounded_rectangle([x, y, x + w, y + h], radius=18, fill=None, outline=ACCENT, width=3)
    f = F(25, True)
    tw = d.textlength(title, font=f)
    d.rectangle([x + 26, y - 18, x + 26 + tw + 20, y + 18], fill=WHITE)
    d.text((x + 36, y - 15), title, font=f, fill=ACCENT)


def canvas(w, h, title):
    im = Image.new("RGB", (w, h), WHITE)
    d = ImageDraw.Draw(im)
    d.text((40, 26), title, font=F(32, True), fill=INK)
    return im, d


def save(im, name):
    im.save(os.path.join(OUT, name), dpi=(300, 300))
    print("wrote", name, im.size)


# ---------------------------------------------------------------- 1. ARSITEKTUR
im, d = canvas(1600, 1210, "Gambar 1. Arsitektur Sistem Tracr")

group(d, 40, 110, 1520, 300, "PERANGKAT PENGGUNA  (peramban / PWA)")
xs = [75, 445, 815, 1185]
box(d, xs[0], 185, 340, 160, "Antarmuka React 19", "TypeScript, halaman dimuat malas per rute", fill=ACCENT_BG)
box(d, xs[1], 185, 340, 160, "TanStack Query", "singgahan permintaan + pembaruan optimistis")
box(d, xs[2], 185, 340, 160, "Service Worker", "Workbox: cangkang aplikasi + singgahan runtime")
box(d, xs[3], 185, 340, 160, "IndexedDB", "antrian mutasi · antrian gagal · singgahan kueri", fill=WARN_BG)
arrow(d, (xs[0] + 340, 265), (xs[1], 265))
arrow(d, (xs[1] + 340, 265), (xs[2], 265))
arrow(d, (xs[2] + 340, 265), (xs[3], 265))

group(d, 40, 530, 1520, 320, "SUPABASE  (Backend as a Service)")
bx = [75, 365, 655, 945, 1235]
box(d, bx[0], 600, 270, 180, "Auth", "Google OAuth, sesi diperbarui otomatis")
box(d, bx[1], 600, 270, 180, "PostgreSQL", "40 migrasi · RLS per pengguna · view account_balances", fill=ACCENT_BG)
box(d, bx[2], 600, 270, 180, "Storage", "bucket privat lampiran struk, URL bertanda tangan")
box(d, bx[3], 600, 270, 180, "Edge Functions", "Deno: autopost · webhook bot · push · analisis")
box(d, bx[4], 600, 270, 180, "pg_cron", "penjadwal harian transaksi berulang")
arrow(d, (bx[4], 690), (bx[3] + 270, 690))
arrow(d, (bx[3], 690), (bx[1] + 270, 690))
arrow(d, (bx[0] + 270, 690), (bx[1], 690))

arrow(d, (430, 410), (430, 600))
label(d, 430, 505, "daring: REST + JWT")
arrow(d, (1180, 410), (1180, 600))
label(d, 1180, 505, "pulih daring: putar ulang antrian FIFO")

arrow(d, (620, 1010), (620, 850))
arrow(d, (980, 850), (980, 1010))
group(d, 430, 950, 740, 200, "LAYANAN LUAR")
box(d, 470, 1010, 300, 110, "Telegram Bot API", None, fill=SOFT2)
box(d, 830, 1010, 300, 110, "Web Push", None, fill=SOFT2)
label(d, 700, 900, "webhook")
label(d, 1060, 900, "notifikasi")
save(im, "01-arsitektur.png")

# ------------------------------------------------------- 2. ALUR SINKRONISASI
im, d = canvas(1600, 1290, "Gambar 2. Alur Pencatatan Luring dan Sinkronisasi Ulang")
steps = [
    ("1.  Pengguna mencatat penjualan tanpa sinyal", None, SOFT),
    ("2.  enqueueOfflineMutation() menulis mutasi ke IndexedDB", "bertahan meskipun aplikasi ditutup atau perangkat dimatikan", WARN_BG),
    ("3.  Catatan tampil seketika di layar", "spanduk status: \"1 catatan menunggu sinkron\"", SOFT),
    ("4.  Koneksi pulih: processOfflineQueue() memutar antrian berurutan (FIFO)", None, ACCENT_BG),
]
y = 110
for t, b, f in steps:
    box(d, 330, y, 940, 130, t, b, fill=f)
    if y < 600:
        arrow(d, (800, y + 130), (800, y + 190))
    y += 190
top = y + 60
outs = [
    (60, "Berhasil", "server mengembalikan UUID asli; remapQueuedTempIds() menukar identitas sementara pada seluruh mutasi yang masih mengantre", OK_BG),
    (575, "Gagal, percobaan < 3", "retryCount bertambah, mutasi tetap berada di antrian dan dicoba lagi pada siklus berikutnya", SOFT),
    (1090, "Gagal 3 kali", "dipindahkan ke antrian gagal yang ditampilkan kepada pengguna beserta pesan galat dan tombol coba lagi", WARN_BG),
]
for x, t, b, f in outs:
    arrow(d, (800, y - 60), (x + 225, top - 10))
    box(d, x, top, 450, 250, t, b, fill=f)
d.text((40, 1230), "Tidak ada catatan yang hilang tanpa sepengetahuan pengguna: setiap kegagalan berakhir pada antrian yang terlihat, bukan pada layar galat.",
       font=F(23, italic=True), fill=LINE)
save(im, "02-alur-luring.png")

# ---------------------------------------------------------------------- 3. ERD
im, d = canvas(1600, 1330, "Gambar 3. Rancangan Basis Data (inti yang relevan dengan sub tema)")


def entity(x, y, w, name, fields, fill=SOFT):
    hh = 52
    h = hh + 16 + len(fields) * 34
    d.rounded_rectangle([x, y, x + w, y + h], radius=10, fill=WHITE, outline=LINE, width=2)
    d.rounded_rectangle([x, y, x + w, y + hh], radius=10, fill=fill, outline=LINE, width=2)
    d.rectangle([x, y + hh - 12, x + w, y + hh], fill=fill, outline=None)
    d.line([(x, y + hh), (x + w, y + hh)], fill=LINE, width=2)
    ctext(d, x + w / 2, y + hh / 2, name, F(25, True))
    yy = y + hh + 10
    for f in fields:
        d.text((x + 16, yy), f, font=F(21), fill=INK)
        yy += 34
    return (x, y, w, h)


b = entity(620, 100, 360, "books", ["id  PK", "owner_id  FK", "type: personal | business"], ACCENT_BG)
r2 = [
    entity(60, 350, 340, "accounts", ["id  PK", "book_id  FK", "name, type", "opening_balance", "is_liability"]),
    entity(440, 350, 340, "categories", ["id  PK", "book_id  FK", "parent_id  FK", "kind: income|expense"]),
    entity(820, 350, 340, "products", ["id  PK", "book_id  FK", "price (harga jual)", "cost (modal)"]),
    entity(1200, 350, 340, "contacts", ["id  PK", "book_id  FK", "name, phone", "kind: customer|supplier"]),
]
tx = entity(230, 720, 480, "transactions", ["id  PK", "book_id, account_id  FK", "type: income|expense|transfer",
                                            "amount  bigint (satuan terkecil)", "base_amount, fx_rate (dibekukan)",
                                            "occurred_on"], ACCENT_BG)
dbt = entity(1000, 720, 440, "debts", ["id  PK", "contact_id  FK", "direction: receivable|payable",
                                       "amount, paid  bigint", "due_date, status"], ACCENT_BG)
ti = entity(150, 1030, 500, "transaction_items", ["id  PK", "transaction_id, product_id  FK",
                                                  "name, qty  (salinan)", "unit_price, unit_cost  (salinan)"])
dp = entity(1030, 1030, 400, "debt_payments", ["id  PK", "debt_id  FK", "amount  bigint", "paid_on"])

# books -> bus -> row2
d.line([(800, 100 + 52 + 16 + 3 * 34), (800, 300)], fill=LINE, width=3)
d.line([(230, 300), (1370, 300)], fill=LINE, width=3)
for x in (230, 610, 990, 1370):
    arrow(d, (x, 300), (x, 350))
label(d, 800, 300, "setiap tabel membawa book_id + user_id (RLS)")
# accounts/categories -> transactions
arrow(d, (230, 350 + 52 + 16 + 5 * 34), (400, 720))
arrow(d, (610, 350 + 52 + 16 + 4 * 34), (540, 720))
# contacts -> debts
arrow(d, (1370, 350 + 52 + 16 + 4 * 34), (1250, 720))
# transactions -> items ; products -> items (dirutekan menghindari kotak transactions)
arrow(d, (420, 720 + 52 + 16 + 6 * 34), (420, 1030))
py = 350 + 52 + 16 + 4 * 34
d.line([(990, py), (990, 700)], fill=LINE, width=3)
d.line([(990, 700), (760, 700)], fill=LINE, width=3)
d.line([(760, 700), (760, 985)], fill=LINE, width=3)
d.line([(760, 985), (600, 985)], fill=LINE, width=3)
arrow(d, (600, 985), (600, 1030))
label(d, 875, 700, "harga & modal disalin saat penjualan")
# debts -> payments
arrow(d, (1230, 720 + 52 + 16 + 5 * 34), (1230, 1030))
save(im, "03-erd.png")

# ----------------------------------------------------------------- 4. USE CASE
im, d = canvas(1700, 1420, "Gambar 4. Use Case Diagram Tracr")


def actor(cx, cy, name):
    d.ellipse([cx - 22, cy - 78, cx + 22, cy - 34], outline=INK, width=3)
    d.line([(cx, cy - 34), (cx, cy + 18)], fill=INK, width=3)
    d.line([(cx - 34, cy - 14), (cx + 34, cy - 14)], fill=INK, width=3)
    d.line([(cx, cy + 18), (cx - 28, cy + 62)], fill=INK, width=3)
    d.line([(cx, cy + 18), (cx + 28, cy + 62)], fill=INK, width=3)
    ctext(d, cx, cy - 140, name, F(24, True), max_w=280)


def uc(cx, cy, text, fill=SOFT):
    w, h = 420, 108
    d.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill=fill, outline=LINE, width=2)
    ctext(d, cx, cy, text, F(22), max_w=w - 60)
    return (cx, cy, w, h)


d.rounded_rectangle([390, 95, 1330, 1355], radius=18, outline=ACCENT, width=3)
tw = d.textlength("Tracr", font=F(28, True))
d.rectangle([420, 76, 420 + tw + 20, 116], fill=WHITE)
d.text((430, 78), "Tracr", font=F(28, True), fill=ACCENT)

colA, colB = 640, 1090
A = ["Masuk dengan akun Google",
     "Membuat & memilih buku (pribadi / usaha)",
     "Mencatat transaksi (daring maupun luring)",
     "Mendaftar produk: harga jual & modal",
     "Mencatat penjualan lewat kasir sederhana",
     "Mencatat & menagih utang pelanggan",
     "Melihat laporan Laba Rugi",
     "Mengekspor laporan PDF / CSV"]
B = ["Menyinkronkan antrian luring",
     "Memasang otomatis transaksi berulang",
     "Mengirim notifikasi tagihan jatuh tempo",
     "Mencatat transaksi lewat percakapan"]
ya = [175 + i * 150 for i in range(8)]
yb = [300, 640, 900, 1160]
for y, t in zip(ya, A):
    uc(colA, y, t)
for y, t in zip(yb, B):
    uc(colB, y, t, ACCENT_BG)

actor(160, 380, "Pelaku Usaha Mikro")
actor(160, 1010, "Pengguna Pribadi")
actor(1570, 640, "Sistem Terjadwal (pg_cron)")
actor(1570, 1160, "Bot Telegram")

for i in (0, 1, 2, 3, 4, 5, 6, 7):
    d.line([(215, 380), (colA - 210, ya[i])], fill=LINE, width=2)
for i in (0, 2, 6, 7):
    d.line([(215, 1010), (colA - 210, ya[i])], fill=(150, 160, 172), width=2)
d.line([(1515, 640), (colB + 210, yb[1])], fill=LINE, width=2)
d.line([(1515, 640), (colB + 210, yb[2])], fill=LINE, width=2)
d.line([(1515, 1160), (colB + 210, yb[3])], fill=LINE, width=2)
arrow(d, (colA + 205, ya[2] - 20), (colB - 205, yb[0] + 14), dashed=True)
label(d, (colA + colB) / 2 + 10, (ya[2] + yb[0]) / 2 - 40, "«include»")
save(im, "04-usecase.png")
