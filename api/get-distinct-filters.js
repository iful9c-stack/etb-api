const mysql = require('mysql2/promise');

// Connection Pool
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
  // CORS Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Ambil parameter filter dari GET (Query String) atau POST (Body)
  const branch = req.query.branch || (req.body && req.body.branch);
  const area = req.query.area || (req.body && req.body.area);
  const regional = req.query.regional || (req.body && req.body.regional);
  const pulau = req.query.pulau || (req.body && req.body.pulau);

  try {
    // 1. Dynamic Where Clause untuk tabel 'data'
    const dataWhere = [];
    const dataParams = [];

    if (branch) {
      dataWhere.push('d.`Branch` = ?');
      dataParams.push(String(branch).trim());
    }
    if (area) {
      dataWhere.push('d.`Area` = ?');
      dataParams.push(String(area).trim());
    }
    if (regional) {
      dataWhere.push('d.`Regional` = ?');
      dataParams.push(String(regional).trim());
    }
    if (pulau) {
      dataWhere.push('d.`Pulau` = ?');
      dataParams.push(String(pulau).trim());
    }

    const dataWhereSql = dataWhere.length > 0 ? `WHERE ${dataWhere.join(' AND ')}` : '';

    // 2. Query Distinct Hari Kumpulan, Branch, dan BP Name (dari tabel 'data')
    const sqlHariKumpulan = `
      SELECT DISTINCT d.\`Hari Kumpulan\` AS value 
      FROM data d 
      ${dataWhereSql} 
      AND d.\`Hari Kumpulan\` IS NOT NULL AND d.\`Hari Kumpulan\` != ''
      ORDER BY value ASC
    `;

    const sqlBranch = `
      SELECT DISTINCT d.\`Branch\` AS value 
      FROM data d 
      ${dataWhereSql} 
      AND d.\`Branch\` IS NOT NULL AND d.\`Branch\` != ''
      ORDER BY value ASC
    `;

    const sqlBpName = `
      SELECT DISTINCT d.\`BP Majelis\` AS value 
      FROM data d 
      ${dataWhereSql} 
      AND d.\`BP Majelis\` IS NOT NULL AND d.\`BP Majelis\` != ''
      ORDER BY value ASC
    `;

    // 3. Query Distinct Tanggapan Mitra (Perlu JOIN jika ada filter hierarki lokasi)
    let sqlTanggapanMitra = '';
    let tanggapanParams = [];

    if (dataWhere.length > 0) {
      sqlTanggapanMitra = `
        SELECT DISTINCT TRIM(r.tanggapan_mitra) AS value
        FROM response r
        INNER JOIN data d ON d.\`customer number\` = r.customer_number
        ${dataWhereSql}
        AND r.tanggapan_mitra IS NOT NULL AND TRIM(r.tanggapan_mitra) != ''
        ORDER BY value ASC
      `;
      tanggapanParams = dataParams;
    } else {
      // Tanpa filter -> Query langsung ke tabel response (sangat cepat)
      sqlTanggapanMitra = `
        SELECT DISTINCT TRIM(tanggapan_mitra) AS value
        FROM response
        WHERE tanggapan_mitra IS NOT NULL AND TRIM(tanggapan_mitra) != ''
        ORDER BY value ASC
      `;
    }

    // 4. Eksekusi 4 Query Secara Paralel (Promise.all) agar Waktu Eksekusi Maksimal
    const [
      [rowsHariKumpulan],
      [rowsBranch],
      [rowsBpName],
      [rowsTanggapan]
    ] = await Promise.all([
      pool.query(sqlHariKumpulan.replace('WHERE  AND', 'WHERE'), dataParams),
      pool.query(sqlBranch.replace('WHERE  AND', 'WHERE'), dataParams),
      pool.query(sqlBpName.replace('WHERE  AND', 'WHERE'), dataParams),
      pool.query(sqlTanggapanMitra.replace('WHERE  AND', 'WHERE'), tanggapanParams)
    ]);

    // Format output menjadi Flat Array yang siap langsung dipakai di dropdown/select frontend
    return res.status(200).json({
      status: true,
      filters_applied: {
        branch: branch || null,
        area: area || null,
        regional: regional || null,
        pulau: pulau || null
      },
      data: {
        hari_kumpulan: rowsHariKumpulan.map(r => r.value),
        branch: rowsBranch.map(r => r.value),
        bp_name: rowsBpName.map(r => r.value),
        tanggapan_mitra: rowsTanggapan.map(r => r.value)
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
