/**
 * UPterindo — backend server
 * Express app yang melayani frontend statis (public/index.html), menyediakan
 * REST API untuk semua modul aplikasi, autentikasi berbasis sesi, dan
 * penyimpanan data persisten dalam file JSON (data/db.json).
 */

'use strict';

const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const ADMIN_INITIAL_PASSWORD = 'AdminTerindo#2026';
/* Alamat yang menerima notifikasi setiap ada pendaftaran akun baru yang
 * menunggu persetujuan. Bisa dioverride lewat env var ADMIN_NOTIFY_EMAIL. */
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'arifinbuburanda@gmail.com';
const ROLE_LABELS = {
  worker: 'Pekerja Lapangan',
  supervisor: 'Supervisor / Mandor',
  agronomist: 'Agronomis',
  warehouse: 'Admin Gudang',
  admin: 'Administrator',
};
const VALID_ROLES = Object.keys(ROLE_LABELS);
/* Koleksi "data master" — hanya role tertentu yang boleh menambah/mengubah/
 * menghapus (tulis). Peran lain tetap bisa membaca (GET) untuk menampilkan
 * data di layar mereka. Koleksi yang TIDAK ada di daftar ini tetap bisa
 * ditulis oleh siapa saja yang sudah login (data operasional harian). */
const COLLECTION_WRITE_ROLES = {
  locations: ['admin'],
  cropCycles: ['admin'],
  productDb: ['admin'],
  itemMaster: ['admin', 'warehouse'],
  sopList: ['admin'],
  problemDict: ['admin'],
  activeIngredients: ['admin'],
  compatGroups: ['admin'],
  purchaseRequests: ['admin', 'warehouse', 'supervisor'],
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

/* ===================== SEED DATA ===================== */
/* Data awal — dipakai hanya sekali untuk membuat data/db.json saat pertama
 * kali server dijalankan. Setelah itu, semua perubahan (tambah/ubah/hapus)
 * disimpan langsung ke data/db.json dan seed ini tidak dipakai lagi. */
const SEED_COLLECTIONS = {
  workOrders: [],

  stockTransactions: [],

  purchaseRequests: [],

  syncQueue: [],

  incomingReports: [],

  attendance: [],

  cropCycles: [
  // --- Pabuaran ---
  {id:'CC-2026-021', location:'Pabuaran', crop:'(menunggu konfirmasi jenis/varietas)', variety:'-', plot:'Greenhouse 1-3', population:1296, unit:'tanaman', status:'ACTIVE', note:'Total populasi 3 greenhouse — jenis & varietas tanaman menyusul konfirmasi dari pengguna'},
  {id:'CC-2026-022', location:'Pabuaran', crop:'Cabai', variety:'-', plot:'Lahan Terbuka', population:8000, unit:'tanaman', ageLabel:'12 HST', status:'ACTIVE'},
  // --- Parung ---
  {id:'CC-2026-023', location:'Parung', crop:'Cabai', variety:'-', plot:'Lahan Terbuka', population:4000, unit:'tanaman', ageLabel:'72 HST', status:'ACTIVE'},
  {id:'CC-2026-024', location:'Parung', crop:'Timun', variety:'-', plot:'Lahan Terbuka', population:2500, unit:'tanaman', ageLabel:'6 HST', status:'ACTIVE'},
  {id:'CC-2026-025', location:'Parung', crop:'Durian', variety:'-', plot:'Kebun Buah', population:285, unit:'pohon', ageLabel:'3 tahun', status:'ACTIVE'},
  {id:'CC-2026-026', location:'Parung', crop:'Kelengkeng', variety:'-', plot:'Kebun Buah', population:20, unit:'pohon', ageLabel:'3 tahun', status:'ACTIVE'},
  {id:'CC-2026-027', location:'Parung', crop:'Alpukat', variety:'-', plot:'Kebun Buah', population:2, unit:'pohon', ageLabel:'3 tahun', status:'ACTIVE'},
  {id:'CC-2026-028', location:'Parung', crop:'Cempedak', variety:'-', plot:'Kebun Buah', population:110, unit:'pohon', ageLabel:'6 tahun', status:'ACTIVE'},
],

  locations: [
  {id:'loc-pabuaran', name:'Pabuaran', description:'3 greenhouse + lahan cabai terbuka'},
  {id:'loc-parung', name:'Parung', description:'Cabai & timun, plus kebun buah tahunan (durian, kelengkeng, alpukat, cempedak)'},
],

  harvestReports: [],

  scoutingSessions: [],

  sopList: [
  {crop:'Melon', name:'SOP Budidaya Melon', version:'v3.2', berlaku:'2026-01-15', reviewer:'—', stages:[
    {name:'1. Persiapan Lahan', items:['Pengukuran dan pembersihan lahan','Olah tanah dan pembuatan bedengan','Pengapuran (jika pH tanah di bawah target 6.0-6.5)']},
    {name:'2. Pemupukan Dasar & Mulsa', items:['Pemberian pupuk dasar (kandang + NPK dasar)','Pemasangan mulsa plastik hitam perak']},
    {name:'3. Persemaian & Tanam', items:['Persemaian benih (7-10 hari sebelum tanam)','Penanaman bibit ke lubang tanam','Penyulaman pada 7 HST']},
    {name:'4. Vegetatif', items:['Irigasi dan fertigasi rutin sesuai resep tahap','Pengikatan dan perambatan ke ajir/tali','Scouting mingguan hama & penyakit']},
    {name:'5. Pembungaan & Pembuahan', items:['Penyerbukan bantuan (jika populasi lebah rendah)','Seleksi/penjarangan buah per tanaman','Treatment preventif sesuai jadwal & hasil scouting']},
    {name:'6. Pematangan', items:['Pengurangan volume irigasi terkontrol (tingkatkan brix)','Pemasangan alas buah','Scouting pra-panen']},
    {name:'7. Panen & Pascapanen', items:['Panen sesuai kriteria matang petik (jaring penuh, aroma)','Grading dan sortasi berdasarkan ukuran & mutu','Sanitasi lahan dan penutupan crop cycle']},
  ]},
  {crop:'Cabai', name:'SOP Budidaya Cabai', version:'v2.1', berlaku:'2025-11-01', reviewer:'—', stages:[
    {name:'1. Persiapan Lahan', items:['Pengukuran dan pembersihan lahan','Olah tanah dan pembuatan bedengan','Pengapuran (jika pH tanah di bawah target 5.5-6.5)']},
    {name:'2. Pemupukan Dasar & Mulsa', items:['Pemberian pupuk dasar (kandang + NPK dasar)','Pemasangan mulsa plastik hitam perak']},
    {name:'3. Persemaian & Tanam', items:['Persemaian benih (21-25 hari sebelum tanam)','Penanaman bibit ke lubang tanam','Penyulaman pada 7-10 HST']},
    {name:'4. Vegetatif', items:['Irigasi dan fertigasi rutin','Pemasangan ajir dan pengikatan batang','Scouting mingguan — waspada kutu kebul & thrips']},
    {name:'5. Pembungaan & Pembuahan', items:['Treatment preventif antraknosa sebelum musim hujan','Pemangkasan tunas air (wiwil)','Scouting intensif 2x/minggu saat cuaca lembap']},
    {name:'6. Panen Berulang', items:['Panen bertahap setiap 3-5 hari','Grading berdasarkan warna & ukuran','Sanitasi buah busuk/reject agar tidak jadi sumber infeksi']},
  ]},
  {crop:'Jagung', name:'SOP Budidaya Jagung', version:'v1.4', berlaku:'2025-09-10', reviewer:'—', stages:[
    {name:'1. Persiapan Lahan', items:['Pengukuran dan pembersihan lahan','Olah tanah','Pembuatan larikan tanam']},
    {name:'2. Tanam & Pupuk Dasar', items:['Penanaman benih langsung (tugal), 2 benih/lubang','Pemberian pupuk dasar','Penyulaman pada 7 HST']},
    {name:'3. Vegetatif Awal', items:['Penyiangan gulma','Pupuk susulan 1 (21 HST)','Scouting ulat grayak (Spodoptera frugiperda)']},
    {name:'4. Vegetatif Lanjut & Berbunga', items:['Pupuk susulan 2 (35 HST)','Pembumbunan (hilling)','Scouting dan treatment bila ambang terlampaui']},
    {name:'5. Pengisian Tongkol', items:['Jaga kelembapan tanah — fase kritis air','Scouting penggerek tongkol']},
    {name:'6. Panen & Pascapanen', items:['Panen sesuai kadar air target (~25-28%)','Pengeringan dan grading','Sanitasi lahan']},
  ]},
],

  problemDict: [
  {name:'Ulat Grayak', sci:'Spodoptera frugiperda', crop:'Jagung, Cabai', desc:'Larva memakan daun muda dan pucuk, aktif malam hari.'},
  {name:'Antraknosa', sci:'Colletotrichum spp.', crop:'Cabai, Melon', desc:'Bercak cekung kehitaman pada buah, berkembang di kelembapan tinggi.'},
  {name:'Defisiensi Kalsium', sci:'—', crop:'Melon, Cabai', desc:'Blossom end rot, ujung buah membusuk kehitaman.'},
  {name:'Kutu Kebul', sci:'Bemisia tabaci', crop:'Cabai, Melon', desc:'Vektor virus kuning, populasi di bawah permukaan daun.'},
  {name:'Layu Fusarium', sci:'Fusarium oxysporum', crop:'Melon, Cabai', desc:'Layu permanen dimulai dari daun bawah, jaringan pembuluh menghitam.'},
],

  productDb: [
  {name:'Emamektin Benzoat 5WG', ai:'Emamektin benzoat', formulasi:'WG (water dispersible granule)', konsentrasi:'50 g/kg', cat:'Insektisida', reg:'RI.01.2024.011', status:'Approved', group:'A',
    dosis:'0.5 g/L air', phi:'3 hari', rei:'12 jam', hazard:'Kelas II — Cukup Berbahaya', ppe:'Masker, sarung tangan, kacamata pelindung',
    target:'Ulat grayak, ulat buah, ulat daun', komoditas:'Cabai, Melon, Jagung, Kubis', catatan:'Bersifat translaminar — efektif pada ulat yang bersembunyi di balik daun.'},
  {name:'Mankozeb 80WP', ai:'Mankozeb', formulasi:'WP (wettable powder)', konsentrasi:'800 g/kg', cat:'Fungisida', reg:'RI.01.2023.204', status:'Approved', group:'B',
    dosis:'2 g/L air', phi:'7 hari', rei:'24 jam', hazard:'Kelas III — Sedikit Berbahaya', ppe:'Masker, sarung tangan',
    target:'Antraknosa, bercak daun, busuk daun', komoditas:'Cabai, Melon, Tomat, Kentang', catatan:'Fungisida kontak multi-situs — rotasikan dengan fungisida sistemik untuk cegah resistensi.'},
  {name:'Glifosat 480SL', ai:'Glifosat', formulasi:'SL (soluble liquid)', konsentrasi:'480 g/L', cat:'Herbisida', reg:'RI.01.2022.077', status:'Suspended', group:'C',
    dosis:'3-5 ml/L air', phi:'—', rei:'24 jam', hazard:'Kelas III — Sedikit Berbahaya', ppe:'Masker, sarung tangan, sepatu boot',
    target:'Gulma daun lebar & rumput', komoditas:'Pra-tanam / gawangan (non-tanaman)', catatan:'Status SUSPENDED — sedang ditinjau ulang, tidak boleh diterbitkan dari gudang sampai status berubah.'},
  {name:'Klorantraniliprol 200SC', ai:'Klorantraniliprol', formulasi:'SC (suspension concentrate)', konsentrasi:'200 g/L', cat:'Insektisida', reg:'RI.01.2024.058', status:'Approved', group:'A',
    dosis:'0.3 ml/L air', phi:'3 hari', rei:'4 jam', hazard:'Kelas III — Sedikit Berbahaya', ppe:'Masker, sarung tangan',
    target:'Ulat grayak, penggerek batang/buah', komoditas:'Jagung, Cabai, Melon', catatan:'Mode of action Grup 28 — rotasikan dengan grup lain setiap 2 siklus aplikasi.'},
  {name:'Kalsium Nitrat', ai:'—', formulasi:'Granul larut air', konsentrasi:'Ca 19%, N 15.5%', cat:'Pupuk', reg:'RI.02.2023.019', status:'Approved', group:'D',
    dosis:'2-3 g/L air (fertigasi)', phi:'—', rei:'—', hazard:'Tidak berbahaya (pupuk)', ppe:'Sarung tangan',
    target:'Pencegahan blossom end rot, penguat dinding sel', komoditas:'Melon, Cabai, Tomat', catatan:'JANGAN dicampur pupuk berbahan sulfat/fosfat — menyebabkan presipitasi (mengendap, menyumbat nozzle).'},
  {name:'Beauveria bassiana', ai:'Beauveria bassiana (jamur entomopatogen)', formulasi:'WP — spora hidup', konsentrasi:'1×10⁸ spora/g', cat:'Biological', reg:'RI.03.2024.005', status:'Approved', group:'E',
    dosis:'5 g/L air', phi:'0 hari (organik)', rei:'0 jam', hazard:'Tidak berbahaya (hayati)', ppe:'Masker debu saat pencampuran',
    target:'Kutu kebul, thrips, wereng', komoditas:'Semua komoditas', catatan:'JANGAN dicampur fungisida kimia — akan membunuh spora jamur menguntungkan ini.'},
  {name:'NPK 16-16-16', ai:'—', formulasi:'Granul', konsentrasi:'N 16%, P₂O₅ 16%, K₂O 16%', cat:'Pupuk', reg:'RI.02.2022.041', status:'Approved', group:'F',
    dosis:'150-250 kg/ha (tabur) atau 1-2 g/L (fertigasi)', phi:'—', rei:'—', hazard:'Tidak berbahaya (pupuk)', ppe:'Sarung tangan',
    target:'Pemupukan dasar & susulan', komoditas:'Semua komoditas', catatan:'Pupuk majemuk seimbang — kompatibel dengan sebagian besar pestisida dan pupuk lain kecuali kalsium.'},
  {name:'Metalaksil 25WP', ai:'Metalaksil', formulasi:'WP (wettable powder)', konsentrasi:'250 g/kg', cat:'Fungisida', reg:'RI.01.2023.098', status:'Approved', group:'G',
    dosis:'2 g/L air', phi:'5 hari', rei:'12 jam', hazard:'Kelas III — Sedikit Berbahaya', ppe:'Masker, sarung tangan',
    target:'Penyakit rebah kecambah, busuk akar (Phytophthora, Pythium)', komoditas:'Melon, Cabai', catatan:'Fungisida sistemik golongan fenilamid — jangan dicampur agen hayati.'},
  {name:'Sulfur 80WDG', ai:'Belerang (Sulfur)', formulasi:'WDG (water dispersible granule)', konsentrasi:'800 g/kg', cat:'Fungisida/Akarisida', reg:'RI.01.2023.152', status:'Approved', group:'H',
    dosis:'2-3 g/L air', phi:'1 hari', rei:'24 jam', hazard:'Kelas III — Sedikit Berbahaya', ppe:'Masker, sarung tangan, kacamata',
    target:'Embun tepung, tungau', komoditas:'Melon, Cabai', catatan:'Jangan aplikasi saat suhu >32°C — risiko fitotoksisitas (daun terbakar). Jangan dicampur produk berbahan minyak.'},
],

  activeIngredients: [
  {name:'Emamektin benzoat', golongan:'Insektisida', moa:'IRAC Grup 6', caraKerja:'Kontak & lambung, translaminar', hazard:'Kelas II', phi:'3 hari', rei:'12 jam'},
  {name:'Mankozeb', golongan:'Fungisida', moa:'FRAC M03 (multi-situs)', caraKerja:'Kontak / protektan', hazard:'Kelas III', phi:'7 hari', rei:'24 jam'},
  {name:'Glifosat', golongan:'Herbisida', moa:'HRAC Grup 9', caraKerja:'Sistemik non-selektif', hazard:'Kelas III', phi:'—', rei:'24 jam'},
  {name:'Klorantraniliprol', golongan:'Insektisida', moa:'IRAC Grup 28', caraKerja:'Sistemik & lambung', hazard:'Kelas III', phi:'3 hari', rei:'4 jam'},
  {name:'Beauveria bassiana', golongan:'Biological', moa:'Entomopatogen (non-kimiawi)', caraKerja:'Infeksi kontak pada kutikula serangga', hazard:'Tidak berbahaya', phi:'0 hari', rei:'0 jam'},
  {name:'Metalaksil', golongan:'Fungisida', moa:'FRAC 4 (fenilamid)', caraKerja:'Sistemik', hazard:'Kelas III', phi:'5 hari', rei:'12 jam'},
  {name:'Belerang (Sulfur)', golongan:'Fungisida/Akarisida', moa:'FRAC M02 (multi-situs)', caraKerja:'Kontak, fumigan ringan', hazard:'Kelas III', phi:'1 hari', rei:'24 jam'},
],

  compatGroups: [
  {code:'A', label:'Insektisida Sintetis'},
  {code:'B', label:'Fungisida Kontak'},
  {code:'C', label:'Herbisida Sistemik'},
  {code:'D', label:'Pupuk Kalsium'},
  {code:'E', label:'Agen Hayati'},
  {code:'F', label:'Pupuk Majemuk NPK'},
  {code:'G', label:'Fungisida Sistemik'},
  {code:'H', label:'Fungisida Sulfur'},
],

  compatMatrix: {
  'A-A':'ok','A-B':'ok','A-C':'no','A-D':'caution','A-E':'caution','A-F':'ok','A-G':'ok','A-H':'caution',
  'B-B':'ok','B-C':'no','B-D':'no','B-E':'no','B-F':'caution','B-G':'ok','B-H':'no',
  'C-C':'no','C-D':'no','C-E':'no','C-F':'no','C-G':'no','C-H':'no',
  'D-D':'ok','D-E':'caution','D-F':'no','D-G':'caution','D-H':'caution',
  'E-E':'ok','E-F':'ok','E-G':'no','E-H':'no',
  'F-F':'ok','F-G':'ok','F-H':'caution',
  'G-G':'ok','G-H':'caution',
  'H-H':'ok',
},

  itemMaster: [],

  treatmentList: [],

  dailyPlans: [],

  monthlyPlans: [],

  dailyReports: [],

  monthlyReports: [],

  greenReports: [],

  pendingRegistrations: []
};

function buildSeedUsers() {
  const passwordHash = bcrypt.hashSync(ADMIN_INITIAL_PASSWORD, 10);
  return [
    { id: 'admin', username: 'admin', name: 'Administrator', role: 'admin', roleLabel: 'Administrator', team: '-', passwordHash, mustChangePassword: true },
  ];
}

function buildSeedDB() {
  return Object.assign({ users: buildSeedUsers() }, SEED_COLLECTIONS);
}

/* ===================== PENYIMPANAN DATA (file JSON) ===================== */
/* db.json menyimpan semua koleksi data aplikasi. Penulisan dilakukan secara
 * atomik (tulis ke file sementara lalu rename) dan diantrekan (queue) supaya
 * dua permintaan yang datang bersamaan tidak saling menimpa/merusak file. */
let dbCache = null;
let writeQueue = Promise.resolve();

function loadDB() {
  if (dbCache) return dbCache;
  if (!fs.existsSync(DB_PATH)) {
    dbCache = buildSeedDB();
    persistDB(dbCache);
  } else {
    try {
      dbCache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (err) {
      console.error('Gagal membaca data/db.json, memakai seed data ulang:', err.message);
      dbCache = buildSeedDB();
      persistDB(dbCache);
    }
  }
  return dbCache;
}

function persistDB(db) {
  const tmpPath = DB_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2));
  fs.renameSync(tmpPath, DB_PATH);
}

function saveDB() {
  writeQueue = writeQueue.then(() => persistDB(dbCache)).catch(err => {
    console.error('Gagal menyimpan data/db.json:', err.message);
  });
  return writeQueue;
}

/* Koleksi yang boleh diakses lewat REST API generik di bawah ini. */
const COLLECTIONS = [
  'syncQueue', 'attendance', 'purchaseRequests',
  'cropCycles', 'scoutingSessions', 'sopList', 'problemDict',
  'productDb', 'activeIngredients', 'compatGroups', 'itemMaster', 'treatmentList',
  'dailyPlans', 'monthlyPlans', 'dailyReports', 'monthlyReports', 'greenReports',
  'locations', 'harvestReports',
];
/* workOrders, incomingReports & stockTransactions TIDAK memakai CRUD generik
 * di atas — workOrders/incomingReports aksesnya berbasis kepemilikan, dan
 * stockTransactions HARUS selalu tercipta bersamaan dengan perubahan stok
 * itemMaster (lihat bagian WORK ORDER, LAPORAN MASALAH & GUDANG/STOK). */
/* compatMatrix bukan daftar (array) melainkan objek referensi pasangan
 * kompatibilitas — disajikan lewat endpoint tersendiri yang read-only. */

function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
}

/* ===================== APP SETUP ===================== */
app.use(express.json({ limit: '12mb' })); // limit lumayan besar karena foto (base64) dikirim lewat body
app.use(session({
  store: new FileStore({ path: SESSIONS_DIR, logFn: function () {} }),
  secret: process.env.SESSION_SECRET || 'upterindo-dev-secret-ganti-di-produksi',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 hari
    httpOnly: true,
    sameSite: 'lax',
  },
}));

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
}

function getSessionUser(req) {
  const db = loadDB();
  return req.session && req.session.userId ? db.users.find(u => u.id === req.session.userId) : null;
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Belum masuk (login diperlukan).' });
  }
  req.currentUser = user;
  next();
}

function requireRole(...roles) {
  return function (req, res, next) {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Belum masuk (login diperlukan).' });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses untuk aksi ini.' });
    }
    req.currentUser = user;
    next();
  };
}

/* ===================== EMAIL (notifikasi persetujuan pendaftaran) ===================== */
/* Kredensial SMTP disimpan di server lewat environment variable (SMTP_USER,
 * SMTP_PASS), TIDAK PERNAH ditulis di kode/GitHub. Kalau env var belum
 * diatur, email tidak benar-benar dikirim — hanya dicatat di log server
 * ("mode simulasi") supaya alur pendaftaran tetap bisa dicoba/diuji tanpa
 * kredensial SMTP sungguhan. Pola ini sama seperti OPENAI_API_KEY di atas. */
const SMTP_CONFIGURED = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
let mailer = null;
if (SMTP_CONFIGURED) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}
async function sendMail({ to, subject, text }) {
  if (!SMTP_CONFIGURED) {
    console.log('[EMAIL SIMULASI] Server belum punya SMTP_USER/SMTP_PASS — email tidak benar-benar terkirim.');
    console.log('  Ke:', to, '| Subjek:', subject);
    console.log('  Isi:', text);
    return { simulated: true };
  }
  try {
    await mailer.sendMail({ from: process.env.SMTP_USER, to, subject, text });
    return { simulated: false };
  } catch (err) {
    console.error('Gagal mengirim email:', err.message);
    return { simulated: false, error: err.message };
  }
}

/* ===================== AUTH ===================== */
app.get('/api/auth/me', (req, res) => {
  const db = loadDB();
  const user = req.session.userId ? db.users.find(u => u.id === req.session.userId) : null;
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Nama pengguna dan kata sandi wajib diisi.' });
  }
  const db = loadDB();
  const user = db.users.find(u => u.username.toLowerCase() === String(username).trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Nama pengguna atau kata sandi salah.' });
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/register', async (req, res) => {
  /* Pendaftaran mandiri TIDAK langsung aktif — masuk sebagai permintaan
   * "menunggu persetujuan" yang harus di-approve oleh Admin lewat menu
   * Admin > Akun Pekerja. Admin juga mendapat notifikasi email (kalau SMTP
   * sudah dikonfigurasi di server; lihat ADMIN_NOTIFY_EMAIL di atas). */
  const { name, email, phone, role, company, password, password2 } = req.body || {};
  if (!name || !email || !phone || !role || !password) {
    return res.status(400).json({ error: 'Semua kolom wajib diisi.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
  }
  if (password2 !== undefined && password !== password2) {
    return res.status(400).json({ error: 'Konfirmasi kata sandi tidak cocok.' });
  }
  if (!VALID_ROLES.includes(role) || role === 'admin') {
    return res.status(400).json({ error: 'Role tidak valid.' });
  }
  const db = loadDB();
  const username = String(email).trim().toLowerCase();
  if (db.users.some(u => u.username === username)) {
    return res.status(409).json({ error: 'Email ini sudah terdaftar. Silakan masuk.' });
  }
  if (!db.pendingRegistrations) db.pendingRegistrations = [];
  if (db.pendingRegistrations.some(p => p.username === username)) {
    return res.status(409).json({ error: 'Email ini sudah mengajukan pendaftaran dan masih menunggu persetujuan Admin.' });
  }
  const pending = {
    id: newId('reg'),
    username,
    name: String(name).trim(),
    phone: String(phone).trim(),
    role,
    roleLabel: ROLE_LABELS[role],
    team: company ? String(company).trim() : '-',
    passwordHash: bcrypt.hashSync(password, 10),
    requestedAt: new Date().toISOString(),
  };
  db.pendingRegistrations.push(pending);
  saveDB();
  sendMail({
    to: ADMIN_NOTIFY_EMAIL,
    subject: 'UPterindo — Pendaftaran akun baru menunggu persetujuan',
    text: `Ada pendaftaran akun baru di UPterindo yang menunggu persetujuan Anda:\n\nNama: ${pending.name}\nEmail/Username: ${pending.username}\nNomor HP: ${pending.phone}\nRole diajukan: ${pending.roleLabel}\nPerusahaan/Kebun: ${pending.team}\n\nSilakan login ke menu Admin > Akun Pekerja untuk menyetujui atau menolak pendaftaran ini.`,
  }).catch(() => {});
  res.status(202).json({ message: 'Pendaftaran berhasil dikirim. Akun akan aktif setelah disetujui Admin.' });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

app.put('/api/auth/me', requireAuth, (req, res) => {
  /* Edit profil sendiri (bukan lewat Admin) — hanya field non-sensitif:
   * nama, telepon, foto profil. Username/role tetap hanya bisa diubah Admin. */
  const { name, phone, photo } = req.body || {};
  const db = loadDB();
  const user = db.users.find(u => u.id === req.currentUser.id);
  if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: 'Nama tidak boleh kosong.' });
    user.name = trimmed;
  }
  if (phone !== undefined) user.phone = String(phone).trim();
  if (photo !== undefined) user.photo = photo;
  saveDB();
  res.json(publicUser(user));
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Kata sandi lama dan baru wajib diisi.' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
  }
  const db = loadDB();
  const user = db.users.find(u => u.id === req.currentUser.id);
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
    return res.status(401).json({ error: 'Kata sandi lama salah.' });
  }
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  delete user.mustChangePassword;
  saveDB();
  res.json({ ok: true });
});

/* ===================== DAFTAR PEKERJA (untuk keperluan assign tugas) ===================== */
/* Endpoint ringan khusus Supervisor/Agronomis/Admin untuk mengisi dropdown
 * "tugaskan ke" saat membuat work order — hanya field yang perlu, bukan
 * data akun lengkap seperti /api/admin/users (yang admin-only). */
app.get('/api/workers', requireRole('supervisor', 'agronomist', 'admin'), (req, res) => {
  const db = loadDB();
  res.json(db.users.filter(u => u.role === 'worker').map(u => ({ id: u.id, name: u.name, team: u.team })));
});

/* ===================== ADMIN — MANAJEMEN AKUN PEKERJA ===================== */
/* Endpoint khusus (bukan lewat CRUD generik) supaya passwordHash tidak pernah
 * terekspos, dan supaya ada validasi khusus (username unik, role valid,
 * tidak bisa hapus diri sendiri / admin terakhir). */
app.get('/api/admin/users', requireRole('admin'), (req, res) => {
  const db = loadDB();
  res.json(db.users.map(publicUser));
});

app.post('/api/admin/users', requireRole('admin'), (req, res) => {
  const { name, username, role, team, password } = req.body || {};
  if (!name || !username || !role || !password) {
    return res.status(400).json({ error: 'Nama, username, role, dan kata sandi wajib diisi.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Role tidak valid.' });
  }
  const db = loadDB();
  const uname = String(username).trim().toLowerCase();
  if (db.users.some(u => u.username.toLowerCase() === uname)) {
    return res.status(409).json({ error: 'Username ini sudah dipakai.' });
  }
  const user = {
    id: newId('user'),
    username: uname,
    name: String(name).trim(),
    role,
    roleLabel: ROLE_LABELS[role],
    team: team ? String(team).trim() : '-',
    passwordHash: bcrypt.hashSync(password, 10),
  };
  db.users.push(user);
  saveDB();
  res.status(201).json(publicUser(user));
});

app.put('/api/admin/users/:id', requireRole('admin'), (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  const { name, username, role, team } = req.body || {};
  if (username) {
    const uname = String(username).trim().toLowerCase();
    if (db.users.some(u => u.id !== user.id && u.username.toLowerCase() === uname)) {
      return res.status(409).json({ error: 'Username ini sudah dipakai.' });
    }
    user.username = uname;
  }
  if (name) user.name = String(name).trim();
  if (team !== undefined) user.team = String(team).trim() || '-';
  if (role) {
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Role tidak valid.' });
    if (user.role === 'admin' && role !== 'admin' && db.users.filter(u => u.role === 'admin').length <= 1) {
      return res.status(400).json({ error: 'Tidak bisa mengubah role admin terakhir.' });
    }
    user.role = role;
    user.roleLabel = ROLE_LABELS[role];
  }
  saveDB();
  res.json(publicUser(user));
});

app.post('/api/admin/users/:id/reset-password', requireRole('admin'), (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
  }
  const db = loadDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  user.mustChangePassword = true;
  saveDB();
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireRole('admin'), (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  if (user.id === req.currentUser.id) {
    return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri yang sedang login.' });
  }
  if (user.role === 'admin' && db.users.filter(u => u.role === 'admin').length <= 1) {
    return res.status(400).json({ error: 'Tidak bisa menghapus admin terakhir.' });
  }
  db.users = db.users.filter(u => u.id !== user.id);
  saveDB();
  res.json({ ok: true });
});

/* ===================== ADMIN — PERSETUJUAN PENDAFTARAN ===================== */
function publicPending(p) {
  if (!p) return null;
  const { passwordHash, ...safe } = p;
  return safe;
}
app.get('/api/admin/registrations', requireRole('admin'), (req, res) => {
  const db = loadDB();
  res.json((db.pendingRegistrations || []).map(publicPending));
});

app.post('/api/admin/registrations/:id/approve', requireRole('admin'), (req, res) => {
  const db = loadDB();
  if (!db.pendingRegistrations) db.pendingRegistrations = [];
  const idx = db.pendingRegistrations.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Permintaan pendaftaran tidak ditemukan.' });
  const pending = db.pendingRegistrations[idx];
  const role = (req.body && req.body.role) || pending.role;
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Role tidak valid.' });
  if (db.users.some(u => u.username === pending.username)) {
    db.pendingRegistrations.splice(idx, 1);
    saveDB();
    return res.status(409).json({ error: 'Username ini sudah terpakai oleh akun lain. Permintaan dihapus.' });
  }
  const user = {
    id: newId('user'),
    username: pending.username,
    name: pending.name,
    phone: pending.phone,
    role,
    roleLabel: ROLE_LABELS[role],
    team: pending.team,
    passwordHash: pending.passwordHash,
  };
  db.users.push(user);
  db.pendingRegistrations.splice(idx, 1);
  saveDB();
  sendMail({
    to: pending.username,
    subject: 'UPterindo — Pendaftaran akun Anda disetujui',
    text: `Halo ${pending.name},\n\nPendaftaran akun UPterindo Anda sudah disetujui Admin. Anda sekarang bisa masuk memakai email/username dan kata sandi yang Anda daftarkan.\n\nRole: ${ROLE_LABELS[role]}`,
  }).catch(() => {});
  res.json(publicUser(user));
});

app.post('/api/admin/registrations/:id/reject', requireRole('admin'), (req, res) => {
  const db = loadDB();
  if (!db.pendingRegistrations) db.pendingRegistrations = [];
  const idx = db.pendingRegistrations.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Permintaan pendaftaran tidak ditemukan.' });
  const pending = db.pendingRegistrations[idx];
  db.pendingRegistrations.splice(idx, 1);
  saveDB();
  sendMail({
    to: pending.username,
    subject: 'UPterindo — Pendaftaran akun Anda belum bisa disetujui',
    text: `Halo ${pending.name},\n\nMohon maaf, pendaftaran akun UPterindo Anda belum bisa disetujui saat ini. Silakan hubungi Admin untuk informasi lebih lanjut.`,
  }).catch(() => {});
  res.json({ ok: true });
});

/* ===================== REFERENSI (read-only) ===================== */
app.get('/api/compat-matrix', requireAuth, (req, res) => {
  const db = loadDB();
  res.json(db.compatMatrix || {});
});

/* ===================== WORK ORDER (TUGAS LAPANGAN) ===================== */
/* Satu sumber data untuk seluruh siklus tugas lapangan: dibuat & ditugaskan
 * oleh Supervisor/Agronomis ke seorang pekerja, dikerjakan pekerja (mulai →
 * jeda → kirim dengan foto & catatan), lalu direview Supervisor/Agronomis
 * (setujui atau minta revisi). Endpoint khusus (bukan CRUD generik) karena
 * aturan aksesnya berbasis kepemilikan, bukan cuma berbasis role. */
const WO_ASSIGN_ROLES = ['supervisor', 'agronomist', 'admin'];
const WO_REVIEW_ROLES = ['supervisor', 'agronomist', 'admin'];

app.get('/api/workorders', requireAuth, (req, res) => {
  const db = loadDB();
  res.json(db.workOrders || []);
});

app.post('/api/workorders', requireRole(...WO_ASSIGN_ROLES), (req, res) => {
  const { cropCycleId, plot, location, act, sop, assignedTo, plannedWorkers, plannedArea, materialsPlanned, scheduledDate, source } = req.body || {};
  if (!act || !assignedTo) {
    return res.status(400).json({ error: 'Aktivitas dan pekerja yang ditugaskan wajib diisi.' });
  }
  const db = loadDB();
  const worker = db.users.find(u => u.id === assignedTo);
  if (!worker) return res.status(400).json({ error: 'Pekerja tidak ditemukan.' });
  const wo = {
    id: newId('WO'),
    cropCycleId: cropCycleId || null,
    plot: plot || '-',
    location: location || '-',
    act: String(act).trim(),
    sop: Array.isArray(sop) ? sop : [],
    sopChecked: Array.isArray(sop) ? sop.map(() => false) : [],
    assignedTo: worker.id,
    assignedToName: worker.name,
    team: worker.team || '-',
    plannedWorkers: plannedWorkers || 1,
    plannedArea: plannedArea || '-',
    materialsPlanned: materialsPlanned || '-',
    scheduledDate: scheduledDate || new Date().toISOString().slice(0, 10),
    status: 'assigned',
    actualWorkers: null,
    actualArea: null,
    materialsActual: null,
    notes: '',
    photos: {},
    revisionNote: '',
    source: source || 'manual',
    createdBy: req.currentUser.id,
    createdByName: req.currentUser.name,
    createdAt: new Date().toISOString(),
  };
  if (!db.workOrders) db.workOrders = [];
  db.workOrders.unshift(wo);
  saveDB();
  res.status(201).json(wo);
});

app.put('/api/workorders/:id', requireAuth, (req, res) => {
  const db = loadDB();
  if (!db.workOrders) db.workOrders = [];
  const wo = db.workOrders.find(w => w.id === req.params.id);
  if (!wo) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
  const user = req.currentUser;
  const body = req.body || {};

  if (WO_REVIEW_ROLES.includes(user.role)) {
    if (body.action === 'approve') {
      if (wo.status !== 'submitted') return res.status(400).json({ error: 'Hanya tugas berstatus Submitted yang bisa disetujui.' });
      wo.status = 'approved';
      wo.approvedAt = new Date().toISOString();
      wo.approvedBy = user.id;
    } else if (body.action === 'revision') {
      if (wo.status !== 'submitted') return res.status(400).json({ error: 'Hanya tugas berstatus Submitted yang bisa dikembalikan untuk revisi.' });
      wo.status = 'revision';
      wo.revisionNote = body.revisionNote || '';
    } else if (body.action === 'cancel') {
      if (!['assigned', 'in_progress', 'paused'].includes(wo.status)) return res.status(400).json({ error: 'Tugas yang sudah dikirim/selesai tidak bisa dibatalkan.' });
      wo.status = 'cancelled';
    } else {
      ['act', 'sop', 'plot', 'location', 'plannedWorkers', 'plannedArea', 'materialsPlanned', 'scheduledDate'].forEach(k => {
        if (body[k] !== undefined) wo[k] = body[k];
      });
    }
  } else if (user.role === 'worker') {
    if (wo.assignedTo !== user.id) {
      return res.status(403).json({ error: 'Anda hanya bisa mengubah tugas milik Anda sendiri.' });
    }
    if (body.action === 'start') {
      if (!['assigned', 'paused', 'revision'].includes(wo.status)) return res.status(400).json({ error: 'Tugas tidak bisa dimulai dari status ini.' });
      wo.status = 'in_progress';
    } else if (body.action === 'pause') {
      if (wo.status !== 'in_progress') return res.status(400).json({ error: 'Hanya tugas yang sedang dikerjakan yang bisa dijeda.' });
      wo.status = 'paused';
    } else if (body.action === 'submit') {
      if (!['assigned', 'in_progress', 'paused', 'revision'].includes(wo.status)) return res.status(400).json({ error: 'Tugas tidak bisa dikirim dari status ini.' });
      wo.actualWorkers = body.actualWorkers ?? wo.actualWorkers;
      wo.actualArea = body.actualArea ?? wo.actualArea;
      wo.materialsActual = body.materialsActual ?? wo.materialsActual;
      wo.notes = body.notes ?? wo.notes;
      if (body.photos) wo.photos = Object.assign({}, wo.photos, body.photos);
      if (body.sopChecked) wo.sopChecked = body.sopChecked;
      wo.status = 'submitted';
      wo.submittedAt = new Date().toISOString();
      wo.revisionNote = '';
    } else if (body.sopChecked !== undefined) {
      wo.sopChecked = body.sopChecked;
    } else {
      return res.status(400).json({ error: 'Aksi tidak dikenali.' });
    }
  } else {
    return res.status(403).json({ error: 'Anda tidak memiliki akses untuk aksi ini.' });
  }

  wo.updatedAt = new Date().toISOString();
  saveDB();
  res.json(wo);
});

app.delete('/api/workorders/:id', requireRole(...WO_ASSIGN_ROLES), (req, res) => {
  const db = loadDB();
  if (!db.workOrders) db.workOrders = [];
  const idx = db.workOrders.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
  const [removed] = db.workOrders.splice(idx, 1);
  saveDB();
  res.json(removed);
});

/* ===================== LAPORAN MASALAH (incoming reports) ===================== */
/* Endpoint khusus (bukan CRUD generik) — pekerja hanya boleh mengubah/hapus
 * laporan miliknya sendiri, dan hanya selama masih berstatus "Menunggu"
 * (belum direview). Supervisor/Agronomis/Admin bisa mereview (setujui,
 * minta revisi, atau tolak) laporan siapa pun. */
app.get('/api/incomingReports', requireAuth, (req, res) => {
  const db = loadDB();
  res.json(db.incomingReports || []);
});

app.post('/api/incomingReports', requireAuth, (req, res) => {
  const db = loadDB();
  const record = Object.assign({}, req.body, {
    id: newId('RPT'),
    status: 'Menunggu',
    reporterId: req.currentUser.id,
    createdAt: new Date().toISOString(),
  });
  if (!db.incomingReports) db.incomingReports = [];
  db.incomingReports.unshift(record);
  saveDB();
  res.status(201).json(record);
});

app.put('/api/incomingReports/:id', requireAuth, (req, res) => {
  const db = loadDB();
  const list = db.incomingReports || [];
  const r = list.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
  const user = req.currentUser;
  const body = req.body || {};
  if (WO_REVIEW_ROLES.includes(user.role)) {
    if (body.action === 'approve') { r.status = 'Disetujui'; r.reviewedBy = user.id; r.reviewedAt = new Date().toISOString(); }
    else if (body.action === 'revision') { r.status = 'Revisi'; r.reviewNote = body.reviewNote || ''; }
    else if (body.action === 'reject') { r.status = 'Ditolak'; r.reviewNote = body.reviewNote || ''; }
    else return res.status(400).json({ error: 'Aksi tidak dikenali.' });
  } else if (user.role === 'worker') {
    if (r.reporterId !== user.id) return res.status(403).json({ error: 'Anda hanya bisa mengubah laporan milik Anda sendiri.' });
    if (r.status !== 'Menunggu') return res.status(400).json({ error: 'Laporan yang sudah diproses tidak bisa diubah lagi.' });
    ['komoditas', 'umur', 'bagianTerdampak', 'jenisGejala', 'jumlahSampel', 'jumlahTerdampak', 'severity', 'distribusi', 'dugaan', 'photos'].forEach(k => {
      if (body[k] !== undefined) r[k] = body[k];
    });
  } else {
    return res.status(403).json({ error: 'Tidak memiliki akses.' });
  }
  r.updatedAt = new Date().toISOString();
  saveDB();
  res.json(r);
});

app.delete('/api/incomingReports/:id', requireAuth, (req, res) => {
  const db = loadDB();
  const list = db.incomingReports || [];
  const idx = list.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
  const user = req.currentUser;
  const r = list[idx];
  const isOwner = r.reporterId === user.id && r.status === 'Menunggu';
  const isReviewer = WO_REVIEW_ROLES.includes(user.role);
  if (!isOwner && !isReviewer) return res.status(403).json({ error: 'Tidak memiliki akses.' });
  list.splice(idx, 1);
  saveDB();
  res.json(r);
});

/* ===================== GUDANG / STOK (penerimaan & pengeluaran barang) ===================== */
/* Endpoint khusus (bukan CRUD generik) karena setiap transaksi HARUS
 * mengubah stok itemMaster secara konsisten (tidak boleh transaksi tercatat
 * tapi stok tidak berubah, atau sebaliknya). */
app.get('/api/stock/transactions', requireAuth, (req, res) => {
  const db = loadDB();
  res.json(db.stockTransactions || []);
});

app.post('/api/stock/receive', requireRole('warehouse', 'admin'), (req, res) => {
  const { itemId, qty, batch, expiry, po, condition } = req.body || {};
  const qtyNum = Number(qty);
  if (!itemId || !qtyNum || qtyNum <= 0) {
    return res.status(400).json({ error: 'Barang dan jumlah (lebih dari 0) wajib diisi.' });
  }
  const db = loadDB();
  const item = (db.itemMaster || []).find(i => String(i.id) === String(itemId));
  if (!item) return res.status(404).json({ error: 'Barang tidak ditemukan.' });
  item.stock = (Number(item.stock) || 0) + qtyNum;
  const trx = {
    id: newId('TRX'),
    type: 'in',
    itemId: item.id,
    itemName: item.name,
    qty: qtyNum,
    unit: item.unit || '-',
    batch: batch || '-',
    expiry: expiry || null,
    po: po || '-',
    condition: condition || 'Baik',
    createdBy: req.currentUser.id,
    createdByName: req.currentUser.name,
    createdAt: new Date().toISOString(),
  };
  if (!db.stockTransactions) db.stockTransactions = [];
  db.stockTransactions.unshift(trx);
  saveDB();
  res.status(201).json({ transaction: trx, item });
});

app.post('/api/stock/issue', requireRole('warehouse', 'admin'), (req, res) => {
  const { itemId, qty, workOrderId, recipient, reason, batch } = req.body || {};
  const qtyNum = Number(qty);
  if (!itemId || !qtyNum || qtyNum <= 0) {
    return res.status(400).json({ error: 'Barang dan jumlah (lebih dari 0) wajib diisi.' });
  }
  const db = loadDB();
  const item = (db.itemMaster || []).find(i => String(i.id) === String(itemId));
  if (!item) return res.status(404).json({ error: 'Barang tidak ditemukan.' });
  const currentStock = Number(item.stock) || 0;
  if (qtyNum > currentStock) {
    return res.status(400).json({ error: 'Stok tidak mencukupi. Stok saat ini: ' + currentStock + ' ' + (item.unit || '') });
  }
  item.stock = currentStock - qtyNum;
  const trx = {
    id: newId('TRX'),
    type: 'out',
    itemId: item.id,
    itemName: item.name,
    qty: qtyNum,
    unit: item.unit || '-',
    batch: batch || '-',
    workOrderId: workOrderId || null,
    recipient: recipient || '-',
    reason: reason || '-',
    createdBy: req.currentUser.id,
    createdByName: req.currentUser.name,
    createdAt: new Date().toISOString(),
  };
  if (!db.stockTransactions) db.stockTransactions = [];
  db.stockTransactions.unshift(trx);
  saveDB();
  res.status(201).json({ transaction: trx, item });
});

/* ===================== CRUD GENERIK UNTUK SEMUA MODUL ===================== */
/* Semua modul (tugas, treatment, laporan, rencana kerja, dst.) memakai pola
 * REST yang sama: GET (daftar), GET/:id, POST (buat baru), PUT/:id (ubah),
 * DELETE/:id (hapus). Ini menjaga server.js tetap ringkas & mudah dikembangkan
 * — menambah modul baru cukup menambah nama koleksi di array COLLECTIONS. */
COLLECTIONS.forEach(collection => {
  const base = '/api/' + collection;
  /* Data master (lokasi, siklus tanam, produk, dll) hanya boleh
   * ditambah/diubah/dihapus oleh Admin — peran lain tetap bisa membaca. */
  const writeGuard = COLLECTION_WRITE_ROLES[collection] ? requireRole(...COLLECTION_WRITE_ROLES[collection]) : requireAuth;

  app.get(base, requireAuth, (req, res) => {
    const db = loadDB();
    res.json(db[collection] || []);
  });

  app.get(base + '/:id', requireAuth, (req, res) => {
    const db = loadDB();
    const item = (db[collection] || []).find(r => String(r.id) === req.params.id);
    if (!item) return res.status(404).json({ error: 'Data tidak ditemukan.' });
    res.json(item);
  });

  app.post(base, writeGuard, (req, res) => {
    const db = loadDB();
    const record = Object.assign({}, req.body);
    if (!record.id) record.id = newId(collection.slice(0, 3).toUpperCase());
    record.createdAt = new Date().toISOString();
    record.createdBy = req.session.userId;
    if (!db[collection]) db[collection] = [];
    db[collection].unshift(record);
    saveDB();
    res.status(201).json(record);
  });

  app.put(base + '/:id', writeGuard, (req, res) => {
    const db = loadDB();
    const list = db[collection] || [];
    const idx = list.findIndex(r => String(r.id) === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Data tidak ditemukan.' });
    list[idx] = Object.assign({}, list[idx], req.body, { id: list[idx].id, updatedAt: new Date().toISOString() });
    saveDB();
    res.json(list[idx]);
  });

  app.delete(base + '/:id', writeGuard, (req, res) => {
    const db = loadDB();
    const list = db[collection] || [];
    const idx = list.findIndex(r => String(r.id) === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Data tidak ditemukan.' });
    const [removed] = list.splice(idx, 1);
    saveDB();
    res.json(removed);
  });
});

/* ===================== ANALISIS FOTO (proxy ke OpenAI) ===================== */
/* Kunci API OpenAI disimpan di server (env var OPENAI_API_KEY), TIDAK PERNAH
 * dikirim ke browser — lebih aman dibanding menyimpan kunci di sisi klien.
 * Kalau env var belum diatur, endpoint ini otomatis memberi hasil simulasi
 * supaya alur tetap bisa dicoba tanpa kunci API sungguhan. */
app.get('/api/ai/status', requireAuth, (req, res) => {
  res.json({ configured: Boolean(process.env.OPENAI_API_KEY) });
});

app.post('/api/ai/analyze-photo', requireAuth, async (req, res) => {
  const { imageDataUrl, prompt } = req.body || {};
  if (!imageDataUrl) {
    return res.status(400).json({ error: 'Foto belum diunggah.' });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.json({
      simulated: true,
      text: 'Mode simulasi (server belum memiliki OPENAI_API_KEY). Contoh hasil: kemungkinan Ulat grayak (Spodoptera frugiperda) — estimasi keyakinan 78%. Alternatif: kerusakan mekanis (12%). Perlu konfirmasi agronomis sebelum treatment.',
    });
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt || 'Analisis kondisi tanaman pada foto ini dan identifikasi kemungkinan hama/penyakit.' },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      const errBody = await response.text();
      console.error('OpenAI API error:', response.status, errBody);
      return res.status(502).json({ error: 'Gagal memanggil OpenAI API (status ' + response.status + ').' });
    }
    const data = await response.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    res.json({ simulated: false, text: text || '(Tidak ada hasil dari model.)' });
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    console.error('AI analyze-photo error:', err.message);
    res.status(504).json({ error: timedOut ? 'Waktu tunggu OpenAI API habis.' : 'Gagal menghubungi OpenAI API: ' + err.message });
  }
});

/* ===================== STATIC FILES ===================== */
app.use(express.static(PUBLIC_DIR));

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', app: 'upterindo' });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  }
  res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* ===================== START ===================== */
app.listen(PORT, () => {
  loadDB(); // pastikan data/db.json dibuat sejak awal
  console.log('UPterindo server berjalan di http://localhost:' + PORT);
  console.log('  Login Admin awal — username: admin | kata sandi: ' + ADMIN_INITIAL_PASSWORD);
  console.log('  (segera login & ganti kata sandi ini setelah server pertama kali jalan)');
  console.log('  Notifikasi pendaftaran akun baru: ' + (SMTP_CONFIGURED
    ? ('email sungguhan aktif, dikirim ke ' + ADMIN_NOTIFY_EMAIL)
    : ('MODE SIMULASI (SMTP_USER/SMTP_PASS belum diatur) — cek log server untuk isi email')));
});
