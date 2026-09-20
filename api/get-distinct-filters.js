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

  const branch = req.query.branch || (req.body && req.body.branch);
  const area = req.query.area || (req.body && req.body.area);
  const regional = req.query.regional || (req.body && req.body.regional);
  const pulau = req.query.pulau || (req.body && req.body.pulau);

  try {
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

    const whereClauseData = dataConditions.length > 0 
      ? `WHERE ${dataConditions.join(' AND ')}` 
      : '';

    // 1 Query Gabungan via UNION ALL untuk meminimalkan I/O Database
    const combinedSql = `
      SELECT 'hari_kumpulan' AS category, d.\`Hari Kumpulan\` AS val 
      FROM data d 
      ${whereClauseData} ${whereClauseData ? 'AND' : 'WHERE'} d.\`Hari Kumpulan\` IS NOT NULL AND d.\`Hari Kumpulan\` != '' 
      GROUP BY d.\`Hari Kumpulan\`

      UNION ALL

      SELECT 'branch' AS category, d.\`Branch\` AS val 
      FROM data d 
      ${whereClauseData} ${whereClauseData ? 'AND' : 'WHERE'} d.\`Branch\` IS NOT NULL AND d.\`Branch\` != '' 
      GROUP BY d.\`Branch\`

      UNION ALL

      SELECT 'bp_name' AS category, d.\`BP Majelis\` AS val 
      FROM data d 
      ${whereClauseData} ${whereClauseData ? 'AND' : 'WHERE'} d.\`BP Majelis\` IS NOT NULL AND d.\`BP Majelis\` != '' 
      GROUP BY d.\`BP Majelis\`

      UNION ALL

      SELECT 'tanggapan_mitra' AS category, TRIM(r.tanggapan_mitra) AS val
      FROM response r
      ${dataConditions.length > 0 
        ? `INNER JOIN data d ON d.\`customer number\` = r.customer_number ${whereClauseData} AND r.tanggapan_mitra IS NOT NULL AND TRIM(r.tanggapan_mitra) != ''`
        : `WHERE r.tanggapan_mitra IS NOT NULL AND TRIM(r.tanggapan_mitra) != ''`
      }
      GROUP BY TRIM(r.tanggapan_mitra)
    `;

    // Parameter diulang 3x/4x sesuai kemunculan whereClauseData di SQL
    const totalParams = dataConditions.length > 0 
      ? [...dataParams, ...dataParams, ...dataParams, ...dataParams] 
      : [];

    const [rows] = await pool.query(combinedSql, totalParams);

    // Pengelompokan cepat di Node.js (in-memory)
    const result = {
      hari_kumpulan: [],
      branch: [],
      bp_name: [],
      tanggapan_mitra: []
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.val && result[row.category]) {
        result[row.category].push(row.val);
      }
    }

    // Sort manual singkat
    result.hari_kumpulan.sort();
    result.branch.sort();
    result.bp_name.sort();
    result.tanggapan_mitra.sort();

    return res.status(200).json({
      status: true,
      filters_applied: {
        branch: branch || null,
        area: area || null,
        regional: regional || null,
        pulau: pulau || null
      },
      data: result
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Database Error: ' + error.message,
      data: null
    });
  }
};
