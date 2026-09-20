const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'mysql-38a538aa-iful9c-fbda.d.aivencloud.com',
  port: parseInt(process.env.MYSQL_PORT || '16305'),
  database: process.env.MYSQL_DATABASE || 'etb',
  user: process.env.MYSQL_USER || 'avnadmin',
  password: process.env.MYSQL_PASSWORD || 'AVNS_RtK8bP4lVAIYuuZCblw',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parameter Filter
  let area = req.query.area || (req.body && req.body.area);
  let branch = req.query.branch || (req.body && req.body.branch);
  let hariKumpulan = req.query.hari_kumpulan || (req.body && req.body.hari_kumpulan);
  let bpName = req.query.bp_name || (req.body && req.body.bp_name);
  let tanggapanMitra = req.query.tanggapan_mitra || (req.body && req.body.tanggapan_mitra);

  try {
    // 1. Dynamic WHERE Clause
    let whereConditions = [];
    let queryParams = [];

    if (area) {
      whereConditions.push('d.`Area` = ?');
      queryParams.push(String(area).trim());
    }
    if (branch) {
      whereConditions.push('d.`Branch` = ?');
      queryParams.push(String(branch).trim());
    }
    if (hariKumpulan) {
      whereConditions.push('d.`Hari Kumpulan` = ?');
      queryParams.push(String(hariKumpulan).trim());
    }
    if (bpName) {
      whereConditions.push('d.`BP Majelis` = ?');
      queryParams.push(String(bpName).trim());
    }
    if (tanggapanMitra) {
      whereConditions.push('r.`tanggapan_mitra` = ?');
      queryParams.push(String(tanggapanMitra).trim());
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // 2. Query Agregasi per Area & BP Majelis
    const summarySql = `
      SELECT
        d.\`Area\` AS nama_area,
        d.\`BP Majelis\` AS nama_bp,
        COUNT(DISTINCT d.\`customer number\`) AS jumlah_akun,
        
        -- Agregasi Status Tanggapan Mitra
        COUNT(DISTINCT CASE WHEN r.id IS NOT NULL THEN d.\`customer number\` END) AS jumlah_diproses,
        COUNT(DISTINCT CASE WHEN LOWER(TRIM(r.tanggapan_mitra)) = 'berminat' THEN d.\`customer number\` END) AS berminat,
        COUNT(DISTINCT CASE WHEN LOWER(TRIM(r.tanggapan_mitra)) IN ('ditolak fo', 'ditolak') THEN d.\`customer number\` END) AS ditolak_fo,
        COUNT(DISTINCT CASE WHEN LOWER(TRIM(r.tanggapan_mitra)) IN ('follow up fo', 'perlu follow up', 'follow up') THEN d.\`customer number\` END) AS perlu_follow_up,
        COUNT(DISTINCT CASE WHEN LOWER(TRIM(r.tanggapan_mitra)) IN ('tidak berminat', 'tdk berminat') THEN d.\`customer number\` END) AS tidak_berminat,
        
        -- Agregasi Spot Check Validation
        COUNT(DISTINCT CASE WHEN (r.validation IS NOT NULL AND TRIM(r.validation) != '') OR (r.\`validation AM\` IS NOT NULL AND TRIM(r.\`validation AM\`) != '') THEN d.\`customer number\` END) AS spot_check,
        COUNT(DISTINCT CASE WHEN LOWER(TRIM(r.validation)) = 'aligned' OR LOWER(TRIM(r.\`validation AM\`)) = 'aligned' THEN d.\`customer number\` END) AS aligned,
        COUNT(DISTINCT CASE WHEN LOWER(TRIM(r.validation)) IN ('not aligned', 'unaligned') OR LOWER(TRIM(r.\`validation AM\`)) IN ('not aligned', 'unaligned') THEN d.\`customer number\` END) AS not_aligned
      FROM data d
      LEFT JOIN response r ON r.id = (
        SELECT r2.id FROM response r2 
        WHERE r2.customer_number = d.\`customer number\` 
        ORDER BY r2.id DESC LIMIT 1
      )
      ${whereClause}
      GROUP BY d.\`Area\`, d.\`BP Majelis\`
      ORDER BY d.\`Area\` ASC, d.\`BP Majelis\` ASC
    `;

    const [rows] = await pool.query(summarySql, queryParams);

    // 3. Olah Data Ke Dalam Format 'per_area' dan 'per_bp_majelis'
    const areaMap = new Map();
    const perBpMajelis = [];

    let grandTotalAkun = 0;
    let grandTotalDiproses = 0;
    let grandTotalBerminat = 0;
    let grandTotalDitolakFo = 0;
    let grandTotalFollowUp = 0;
    let grandTotalTidakBerminat = 0;
    let grandTotalSpotCheck = 0;
    let grandTotalAligned = 0;
    let grandTotalNotAligned = 0;

    rows.forEach(r => {
      const jumlahAkun = Number(r.jumlah_akun) || 0;
      const diproses = Number(r.jumlah_diproses) || 0;
      const berminat = Number(r.berminat) || 0;
      const ditolakFo = Number(r.ditolak_fo) || 0;
      const followUp = Number(r.perlu_follow_up) || 0;
      const tidakBerminat = Number(r.tidak_berminat) || 0;
      const spotCheck = Number(r.spot_check) || 0;
      const aligned = Number(r.aligned) || 0;
      const notAligned = Number(r.not_aligned) || 0;

      // Accumulate Grand Total
      grandTotalAkun += jumlahAkun;
      grandTotalDiproses += diproses;
      grandTotalBerminat += berminat;
      grandTotalDitolakFo += ditolakFo;
      grandTotalFollowUp += followUp;
      grandTotalTidakBerminat += tidakBerminat;
      grandTotalSpotCheck += spotCheck;
      grandTotalAligned += aligned;
      grandTotalNotAligned += notAligned;

      // --- PER BP MAJELIS ---
      perBpMajelis.push({
        nama_area: r.nama_area,
        nama_bp: r.nama_bp,
        jumlah_akun: jumlahAkun,
        jumlah_leads: jumlahAkun,
        proses: jumlahAkun > 0 ? `${((diproses / jumlahAkun) * 100).toFixed(2)}%` : '0.00%',
        berminat: jumlahAkun > 0 ? `${((berminat / jumlahAkun) * 100).toFixed(2)}%` : '0.00%',
        ditolak_fo: jumlahAkun > 0 ? `${((ditolakFo / jumlahAkun) * 100).toFixed(2)}%` : '0.00%',
        perlu_follow_up: jumlahAkun > 0 ? `${((followUp / jumlahAkun) * 100).toFixed(2)}%` : '0.00%',
        tidak_berminat: jumlahAkun > 0 ? `${((tidakBerminat / jumlahAkun) * 100).toFixed(2)}%` : '0.00%',
        jumlah_leads_spot_check: spotCheck,
        spot_check_pct: jumlahAkun > 0 ? `${((spotCheck / jumlahAkun) * 100).toFixed(2)}%` : '0.00%',
        aligned: spotCheck > 0 ? `${((aligned / spotCheck) * 100).toFixed(2)}%` : '0.00%',
        not_aligned: spotCheck > 0 ? `${((notAligned / spotCheck) * 100).toFixed(2)}%` : '0.00%'
      });

      // --- GROUPING PER AREA ---
      if (!areaMap.has(r.nama_area)) {
        areaMap.set(r.nama_area, {
          nama_area: r.nama_area,
          jumlah_bp_set: new Set(),
          jumlah_akun: 0,
          diproses: 0,
          berminat: 0,
          ditolak_fo: 0,
          follow_up: 0,
          tidak_berminat: 0,
          spot_check: 0,
          aligned: 0,
          not_aligned: 0
        });
      }

      const a = areaMap.get(r.nama_area);
      if (r.nama_bp) a.jumlah_bp_set.add(r.nama_bp);
      a.jumlah_akun += jumlahAkun;
      a.diproses += diproses;
      a.berminat += berminat;
      a.ditolak_fo += ditolakFo;
      a.follow_up += followUp;
      a.tidak_berminat += tidakBerminat;
      a.spot_check += spotCheck;
      a.aligned += aligned;
      a.not_aligned += notAligned;
    });

    // Format Array Per Area
    const perArea = Array.from(areaMap.values()).map(a => ({
      nama_area: a.nama_area,
      jumlah_bp: a.jumlah_bp_set.size,
      jumlah_akun: a.jumlah_akun,
      jumlah_leads: a.jumlah_akun,
      proses: a.jumlah_akun > 0 ? `${((a.diproses / a.jumlah_akun) * 100).toFixed(2)}%` : '0.00%',
      berminat: a.jumlah_akun > 0 ? `${((a.berminat / a.jumlah_akun) * 100).toFixed(2)}%` : '0.00%',
      ditolak_fo: a.jumlah_akun > 0 ? `${((a.ditolak_fo / a.jumlah_akun) * 100).toFixed(2)}%` : '0.00%',
      perlu_follow_up: a.jumlah_akun > 0 ? `${((a.follow_up / a.jumlah_akun) * 100).toFixed(2)}%` : '0.00%',
      tidak_berminat: a.jumlah_akun > 0 ? `${((a.tidak_berminat / a.jumlah_akun) * 100).toFixed(2)}%` : '0.00%',
      jumlah_leads_spot_check: a.spot_check,
      spot_check_pct: a.jumlah_akun > 0 ? `${((a.spot_check / a.jumlah_akun) * 100).toFixed(2)}%` : '0.00%',
      aligned: a.spot_check > 0 ? `${((a.aligned / a.spot_check) * 100).toFixed(2)}%` : '0.00%',
      not_aligned: a.spot_check > 0 ? `${((a.not_aligned / a.spot_check) * 100).toFixed(2)}%` : '0.00%'
    }));

    // Row Total Keseluruhan
    const totalRow = {
      nama_area: 'Total',
      jumlah_bp: rows.reduce((acc, r) => acc + (r.nama_bp ? 1 : 0), 0),
      jumlah_akun: grandTotalAkun,
      jumlah_leads: grandTotalAkun,
      proses: grandTotalAkun > 0 ? `${((grandTotalDiproses / grandTotalAkun) * 100).toFixed(2)}%` : '0.00%',
      berminat: grandTotalAkun > 0 ? `${((grandTotalBerminat / grandTotalAkun) * 100).toFixed(2)}%` : '0.00%',
      ditolak_fo: grandTotalAkun > 0 ? `${((grandTotalDitolakFo / grandTotalAkun) * 100).toFixed(2)}%` : '0.00%',
      perlu_follow_up: grandTotalAkun > 0 ? `${((grandTotalFollowUp / grandTotalAkun) * 100).toFixed(2)}%` : '0.00%',
      tidak_berminat: grandTotalAkun > 0 ? `${((grandTotalTidakBerminat / grandTotalAkun) * 100).toFixed(2)}%` : '0.00%',
      jumlah_leads_spot_check: grandTotalSpotCheck,
      spot_check_pct: grandTotalAkun > 0 ? `${((grandTotalSpotCheck / grandTotalAkun) * 100).toFixed(2)}%` : '0.00%',
      aligned: grandTotalSpotCheck > 0 ? `${((grandTotalAligned / grandTotalSpotCheck) * 100).toFixed(2)}%` : '0.00%',
      not_aligned: grandTotalSpotCheck > 0 ? `${((grandTotalNotAligned / grandTotalSpotCheck) * 100).toFixed(2)}%` : '0.00%'
    };

    return res.status(200).json({
      status: true,
      message: 'Summary lead area berhasil dimuat.',
      filters_applied: {
        area: area || null,
        branch: branch || null,
        hari_kumpulan: hariKumpulan || null,
        bp_name: bpName || null,
        tanggapan_mitra: tanggapanMitra || null
      },
      data: {
        per_area: perArea,
        per_bp_majelis: perBpMajelis,
        total: totalRow
      }
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Database Error: ' + error.message,
      data: null
    });
  }
};
