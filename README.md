# UPterindo

Aplikasi manajemen budidaya pertanian oleh **Terindo Group** (PT Tetra Jaya Plusindo). Backend Node.js/Express dengan autentikasi sungguhan dan penyimpanan data persisten (file JSON), frontend satu halaman (HTML/CSS/vanilla JS) yang responsif untuk desktop maupun smartphone.

🔗 **Menjalankan:** lihat [Menjalankan secara lokal](#menjalankan-secara-lokal) di bawah, lalu buka `http://localhost:3000/`.

---

## Struktur repo

```
.
├── server.js              # Backend Express — auth, REST API, penyimpanan data
├── package.json            # Dependencies & scripts (start, dev)
├── data/                    # Dibuat otomatis saat pertama kali dijalankan (JANGAN di-commit)
│   ├── db.json               # Seluruh data aplikasi (persisten)
│   └── sessions/              # Sesi login yang sedang aktif
├── public/
│   ├── index.html            # Aplikasi (satu file: HTML + CSS + vanilla JS)
│   └── assets/
│       ├── terindo-icon-transparent.png
│       └── terindo-icon-256.png
└── README.md
```

- **`public/index.html`** — seluruh aplikasi dalam satu file: layar masuk/daftar, 4 peran pengguna (Pekerja Lapangan, Supervisor, Agronomis, Gudang), dan semua modul. Tidak ada dependency eksternal (CSS Tailwind sudah di-*compile* & di-inline) — hanya memanggil API sendiri (`/api/...`) lewat `fetch()`.
- **`server.js`** — melayani `public/`, menyediakan REST API untuk semua modul, menangani login/daftar/keluar berbasis sesi, dan proxy analisis foto AI ke OpenAI (supaya kunci API tidak pernah ada di browser).
- **`data/db.json`** — "database" aplikasi. Dibuat otomatis dari data contoh (seed) saat server pertama kali dijalankan, lalu berubah mengikuti pemakaian (tambah barang, treatment, rencana kerja, laporan, akun baru, dst). File ini **sudah masuk `.gitignore`** — jangan di-commit, karena berisi data yang akan terus berubah di server produksi.

## Menjalankan secara lokal

```bash
npm install
npm start
```

Lalu buka `http://localhost:3000/`. Saat pertama kali dijalankan, server otomatis membuat `data/db.json` berisi data contoh serta 6 akun demo.

Port bisa diganti lewat environment variable `PORT` (mis. `PORT=8080 npm start`). Untuk auto-reload saat development: `npm run dev`.

## Masuk / mendaftar

Autentikasi sungguhan: kata sandi disimpan ter-hash (bcrypt) di server, sesi login memakai cookie `httpOnly` (bukan sekadar klik tanpa verifikasi). Ada dua cara masuk:

1. **Akun demo** — klik salah satu kartu di layar masuk untuk mengisi form secara otomatis, lalu klik **Masuk**:

   | Nama pengguna | Peran |
   |---|---|
   | budi.santoso, siti.aminah, joko.prasetyo | Pekerja Lapangan |
   | reza.pratama | Supervisor / Mandor |
   | rina.wulandari | Agronomis |
   | dedi.kurniawan | Admin Gudang |

   Kata sandi untuk semua akun demo: **`Terindo@2026`**

2. **Daftar akun baru** — tab "Daftar" di layar masuk, isi email/nomor HP/peran/kata sandi. Akun baru langsung tersimpan di `data/db.json` dan bisa dipakai masuk kapan saja setelahnya.

> Untuk pemakaian produksi sungguhan: ganti kata sandi akun demo (atau hapus akunnya dari `data/db.json`), dan atur `SESSION_SECRET` (lihat di bawah) ke nilai acak yang rahasia.

## Environment variables (opsional)

| Variabel | Kegunaan | Default |
|---|---|---|
| `PORT` | Port server | `3000` |
| `SESSION_SECRET` | Kunci rahasia untuk menandatangani cookie sesi — **wajib diganti** sebelum dipakai sungguhan | nilai bawaan (tidak aman untuk produksi) |
| `OPENAI_API_KEY` | Kunci OpenAI API untuk analisis foto tanaman sungguhan. Kalau kosong, fitur analisis AI otomatis memakai contoh hasil simulasi supaya alur tetap bisa dicoba | (kosong → mode simulasi) |
| `OPENAI_MODEL` | Model OpenAI yang dipakai untuk analisis foto | `gpt-4o-mini` |

Kunci OpenAI **tidak pernah** dikirim ke browser — semua panggilan ke OpenAI dilakukan dari server (`server.js`), browser hanya memanggil `/api/ai/analyze-photo` milik aplikasi sendiri.

## Deploy ke hosting Node (Render, Railway, Fly.io, Hostinger Node.js App, VPS, dsb.)

- **Build command:** `npm install`
- **Start command / Entry file:** `server.js`
- **Port:** otomatis mengikuti env var `PORT` yang disediakan platform
- Set `SESSION_SECRET` (dan `OPENAI_API_KEY` kalau ingin analisis AI sungguhan) di pengaturan environment variables platform hosting.
- Pastikan folder `data/` punya izin tulis (writable) di server — di situ semua data aplikasi disimpan.

> **Penting untuk hosting yang menghapus/reset filesystem tiap deploy** (beberapa platform container melakukan ini): data di `data/db.json` bisa ikut ter-reset. Kalau hosting Anda melakukan ini, pertimbangkan volume/disk persisten dari platform tersebut, atau pindah ke database eksternal di iterasi berikutnya.

Setelah domain sendiri aktif, arahkan DNS (A/CNAME record) ke hosting tersebut — tidak ada perubahan kode yang diperlukan.

## Cakupan fitur (17 modul)

Perencanaan Tanam · Manajemen Tugas · Scouting & OPT · Treatment Planner · SOP Library (bertahap per komoditas) · Database Bahan Aktif & Produk · Indeks Kompatibilitas Campuran · Peta Lahan · Kehadiran Tim · Approval Workflow · Rencana Kerja Harian · Rencana Kerja Bulanan · Laporan Harian (unduh PDF) · Laporan Bulanan (unduh PDF) · Laporan Hijau (sustainability) · Manajemen Gudang · Analisis Foto Tanaman berbasis AI.

## Cara kerja API

Semua modul data (tugas, treatment, rencana kerja, laporan, dst.) memakai pola REST yang sama, di-proteksi login (butuh sesi aktif):

```
GET    /api/<modul>        daftar semua data
GET    /api/<modul>/:id     satu data
POST   /api/<modul>         buat data baru
PUT    /api/<modul>/:id     ubah data
DELETE /api/<modul>/:id     hapus data
```

Contoh `<modul>`: `tasks`, `itemMaster`, `treatmentList`, `dailyPlans`, `monthlyPlans`, `dailyReports`, `monthlyReports`, `greenReports`, `sopList`, `productDb`, `activeIngredients`, dst. Auth terpisah lewat `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`, `GET /api/auth/me`.

Pola generik ini dipilih supaya menambah modul baru cukup menambah nama koleksi di `server.js` (array `COLLECTIONS`) — tidak perlu menulis ulang logika CRUD setiap kali.

## Catatan teknis & batasan yang jujur perlu diketahui

- **Penyimpanan data**: file JSON (`data/db.json`), ditulis secara atomik (tulis ke file sementara lalu rename) dan diantrekan supaya permintaan bersamaan tidak saling menimpa. Cocok untuk skala tim kecil–menengah; kalau nanti datanya sudah besar/butuh query kompleks, ini adalah bagian yang paling masuk akal untuk diganti ke database sungguhan (mis. PostgreSQL/SQLite) — struktur `server.js` sudah dipisah rapi (fungsi `loadDB`/`saveDB`) supaya migrasi ini tidak perlu mengubah kode frontend maupun bentuk API.
- **Sesi login** disimpan sebagai file di `data/sessions/` (bukan di memori), supaya pengguna tidak otomatis ter-logout tiap kali server di-restart/redeploy.
- **Beberapa tombol aksi cepat** (mis. "Setujui" pada antrian approval, "Setujui & Buat Work Order" pada rekomendasi treatment) saat ini masih tampilan saja (belum menyimpan perubahan status ke server) — perubahan status yang sudah tersambung penuh ke backend adalah: Master Barang, Treatment Baru, Rencana Kerja Harian/Bulanan, dan pembuatan Laporan Harian/Bulanan/Hijau. Ini disebutkan secara terbuka supaya jelas mana yang sudah "hidup" dan mana yang masih perlu dikembangkan lebih lanjut.
- **Ekspor PDF** memakai dialog cetak bawaan browser (`window.print()` + CSS `@media print`) — tanpa library PDF eksternal.
- Tailwind CSS di-*compile* secara statis dan di-inline ke `public/index.html` (bukan memuat dari CDN), sehingga tampilan tetap konsisten meski offline atau CDN diblokir.

## Lisensi & kredit

Aplikasi internal untuk **Terindo Group — PT Tetra Jaya Plusindo**. Sesuaikan bagian ini (mis. tambahkan `LICENSE`) sebelum repo dipublikasikan secara publik.
