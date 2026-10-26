# Catatan Rilis — UPterindo V3.0 Fase 1 (Oktober 2026)

Paket ini dibangun di atas paket perbaikan `upterindo-fix-v4` yang sudah teruji sebelumnya, ditambah implementasi kode pertama dari rencana besar **"V3.0 Redesign UI/UX & Integrasi Seluruh Workflow"** yang sudah disetujui.

**PENTING sebelum upload:** paket ini belum pernah di-push ke GitHub karena sesi ini tidak punya akses push ke repo `Arifinbuburanda/TERINDO`. Artinya **semua perbaikan v4 yang lama (termasuk perbaikan bug `openIssues` dan penulisan jujur modul yang belum ada) JUGA belum live di upterindo.com** — paket ini sekali upload akan membawa v4 **dan** V3.0 Fase 1 sekaligus ke production.

## 1. Apa yang baru di Fase 1 ini

### a. Dua peran (role) login baru: Purchasing & Maintenance
Sesuai keputusan Anda (role login terpisah, bukan digabung ke role yang sudah ada):

- **Purchasing** — Supplier, Purchase Order, Invoice (verifikasi 3-way match otomatis).
- **Maintenance** — Data Aset, Laporan Kerusakan, Work Order Perbaikan.

Setiap akun baru dengan role ini otomatis diarahkan ke panel masing-masing saat login (dibuat lewat menu Admin → Akun Pekerja, sama seperti akun lain).

### b. Aturan bisnis baru yang ditegakkan SERVER (tidak bisa dilewati dari browser)

- **PO tidak pernah menambah stok.** Stok gudang hanya bertambah lewat Penerimaan Barang (Gudang) yang **boleh dikaitkan** ke sebuah PO. Sistem otomatis menolak jika jumlah yang diterima melebihi jumlah yang dipesan di PO tersebut.
- **Invoice tidak bisa dipaksa "matched" dari sisi klien.** Tombol "Verifikasi" memicu pengecekan 3-way-match di server: dibandingkan dengan nilai barang yang **benar-benar sudah diterima** Gudang (bukan sekadar yang dipesan), dengan toleransi 1%. Kalau tidak cocok, atau belum ada barang diterima sama sekali, invoice otomatis ditandai **"Discrepancy"** beserta alasannya — bukan lolos diam-diam.
- **Barang dengan status Suspended di katalog produk tidak bisa diterima ke gudang maupun dipakai di rencana treatment** — termasuk kalau nama barang di gudang sedikit berbeda dari nama di katalog (dikaitkan lewat field baru "Kaitkan ke katalog produk" di Master Barang).
- **Pemakaian material untuk Work Order Maintenance otomatis mengurangi stok gudang** (lewat Pengeluaran Barang yang dikaitkan ke Work Order Maintenance) dan tercatat di riwayat `materialsUsed` work order tersebut — jadi biaya material perbaikan bisa dilihat, tidak hilang.

### c. Data referensi baru: Blok & Komoditas
Menu baru di Admin → **Blok & Komoditas**. Data Blok (4 blok) diturunkan langsung dari data Siklus Tanam yang sudah ada (bukan data mengada-ada), begitu juga 8 Komoditas. Dipakai sebagai referensi perencanaan untuk Purchasing dan modul lain nanti.

### d. Offline sync Pekerja Lapangan — sekarang SUNGGUHAN
Sebelumnya tombol "Sinkronkan" di panel Pekerja Lapangan hanya efek visual (tidak benar-benar mengirim apa pun ke server). Sekarang:
- Aksi yang gagal karena tidak ada sinyal (submit tugas, update checklist SOP, lapor masalah) otomatis disimpan di perangkat (localStorage) dan ditandai "Tersimpan di perangkat".
- Begitu sinyal kembali (event `online` browser) atau pekerja menekan "Sinkronkan", semua antrian dikirim ulang ke server sungguhan — bukan simulasi.
- Kalau server menolak (misalnya data tidak valid), status berubah jadi "Ditolak server" dengan alasannya, bukan hilang diam-diam.

## 2. Yang SENGAJA belum dikerjakan di fase ini (sesuai urutan prioritas yang sudah didiskusikan)

- Modul **Keuangan**, **Panen & Pascapanen**, dan **Manajemen** (dashboard eksekutif) — belum dibangun, menyusul di fase berikutnya.
- Pembatasan akses per lokasi/kebun (`locationIds`) — sengaja ditunda karena masih menunggu keputusan Anda soal "Data Perusahaan: satu perusahaan vs multi-tenant" dari dokumen proposal sebelumnya.
- Penyatuan visual/design-system sepenuhnya sesuai Design Canvas yang sudah dibuat — struktur & warna dasar sudah konsisten dengan panel lain yang ada, tapi belum dipoles penuh ke level mockup desain.
- Laporan kerusakan aset saat ini hanya bisa dibuat dari panel Maintenance sendiri (oleh staf Maintenance) — belum dibuka ke panel Pekerja Lapangan/Supervisor. Bisa ditambahkan di fase berikutnya kalau dibutuhkan.
- Pengujian otomatis (Playwright) untuk alur baru ini sudah dijalankan manual lewat browser headless selama pengembangan (semua lolos, tidak ada error JavaScript), tapi belum ditulis sebagai test suite permanen di repo.

## 3. Pengujian yang sudah dilakukan sebelum paket ini dikirim

- Semua endpoint API baru diuji lewat `curl` end-to-end: supplier → PO → penerimaan sebagian → percobaan kelebihan terima (ditolak, sesuai rencana) → invoice salah jumlah (jadi Discrepancy) → invoice benar (jadi Matched) → laporan kerusakan → review bertahap → Work Order → pemakaian material → selesai.
- Login dan navigasi penuh untuk ketiga role (Purchasing, Maintenance, Admin) diuji lewat browser otomatis (Playwright headless) — nol error JavaScript, termasuk mengisi & mengirim form Supplier, Purchase Order, Aset, dan Laporan Kerusakan langsung lewat antarmuka (bukan cuma API).
- `node -c server.js` — sintaks backend valid.
- Tidak ada data existing yang dihapus/direset selama pengembangan — semua koleksi baru yang belum punya data sungguhan diisi array kosong `[]`, bukan data contoh buatan.

## 4. Cara upload (git push masih belum bisa dilakukan dari sesi ini)

1. Buka repo `Arifinbuburanda/TERINDO` di GitHub lewat browser.
2. Upload (replace) file-file berikut dari paket ini: `server.js`, `public/index.html`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `README.md` (dan tambahkan `CATATAN_RILIS_V5.md` ini sebagai dokumentasi).
3. **JANGAN** upload folder `data/` — itu akan dibuat otomatis oleh server saat pertama kali jalan (sesuai `.gitignore`), dan kalau ada `data/db.json` versi lama di server production, folder itu TIDAK akan tertimpa oleh upload ini (aman, data existing tidak hilang).
4. Setelah upload, jika hosting auto-deploy (Hostinger), tunggu proses deploy selesai, lalu segera login sebagai admin dan buat akun Purchasing/Maintenance pertama lewat menu Akun Pekerja.
5. Segera ganti kata sandi admin bawaan jika belum pernah diganti sebelumnya.
