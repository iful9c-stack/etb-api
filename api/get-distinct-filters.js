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
    // 1. Array penampung kondisi WHERE dinamis
    const dataConditions = [];
    const dataParams = [];

    if (branch) {
      dataConditions.push('d.`Branch` = ?');
      dataParams.push(String(branch).trim());
    }
    if (area) {
      dataConditions.push('d.`Area` = ?');
      dataParams.push(String(area).trim());
    }
    if (regional) {
      dataConditions.push('d.`Regional` = ?');
      dataParams.push(String(regional).trim());
    }
    if (pulau) {
      dataConditions.push('d.`Pulau` = ?');
      dataParams.push(String(pulau).trim());
    }

    // Helper Function untuk membangun Query Distinct secara aman
    const buildQuery = (columnName) => {
      const conditions = [...dataConditions, `${columnName} IS NOT NULL`, `${columnName} != ''`].join(' AND ');
      return `
        SELECT DISTINCT ${columnName} AS value 
        FROM data d 
        WHERE ${conditions}
        ORDER BY value ASC
      `;
    };

    // 2. Query Distinct Hari Kumpulan, Branch, dan BP Name
    const sqlHariKumpulan = buildQuery('d.`Hari Kumpulan`');
    const sqlBranch = buildQuery('d.`Branch`');
    const sqlBpName = buildQuery('d.`BP Majelis`');

    // 3. Query Distinct Tanggapan Mitra
    let sqlTanggapanMitra = '';
    let tanggapanParams = [];

    if (dataConditions.length > 0) {
      const responseConditions = [...dataConditions, 'r.tanggapan_mitra IS NOT NULL', "TRIM(r.tanggapan_mitra) != ''"].join(' AND ');
      sqlTanggapanMitra = `
        SELECT DISTINCT TRIM(r.tanggapan_mitra) AS value
        FROM response r
        INNER JOIN data d ON d.\`customer number\` = r.customer_number
        WHERE ${responseConditions}
        ORDER BY value ASC
      `;
      tanggapanParams = dataParams;
    } else {
      // Tanpa filter -> query langsung ke tabel response (sangat cepat)
      sqlTanggapanMitra = `
        SELECT DISTINCT TRIM(tanggapan_mitra) AS value
        FROM response
        WHERE tanggapan_mitra IS NOT NULL AND TRIM(tanggapan_mitra) != ''
        ORDER BY value ASC
      `;
    }

    // 4. Eksekusi Paralel 4 Query Simultan
    const [
      [rowsHariKumpulan],
      [rowsBranch],
      [rowsBpName],
      [rowsTanggapan]
    ] = await Promise.all([
      pool.query(sqlHariKumpulan, dataParams),
      pool.query(sqlBranch, dataParams),
      pool.query(sqlBpName, dataParams),
      pool.query(sqlTanggapanMitra, tanggapanParams)
    ]);

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
