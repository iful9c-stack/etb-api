const mysql = require('mysql2/promise');

// Connection Pool untuk testing performa cepat
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'mysql-38a538aa-iful9c-fbda.d.aivencloud.com',
  port: parseInt(process.env.MYSQL_PORT || '16305'),
  database: process.env.MYSQL_DATABASE || 'etb',
  user: process.env.MYSQL_USER || 'avnadmin',
  password: process.env.MYSQL_PASSWORD || 'AVNS_RtK8bP4lVAIYuuZCblw',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = async (req, res) => {
  // CORS Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { draw = '1', start = '0', length = '10', searchValue = '' } = req.query;

  const parsedDraw = parseInt(draw);
  const parsedStart = parseInt(start);
  const parsedLength = parseInt(length);
  const search = searchValue.trim();

  try {
    // 1. Hitung total seluruh baris
    const [totalRows] = await pool.query('SELECT COUNT(*) as total FROM `user`');
    const recordsTotal = totalRows[0].total;

    let whereClause = '';
    let queryParams = [];

    // 2. Multi-column search
    if (search !== '') {
      whereClause = ` WHERE 
        island_name LIKE ? OR 
        region_name LIKE ? OR 
        area_name LIKE ? OR 
        branch_name LIKE ? OR 
        branch_id LIKE ? OR 
        island_remap_by_ops LIKE ? OR 
        email LIKE ? OR 
        \`role\` LIKE ?`;
      const term = `%${search}%`;
      queryParams = [term, term, term, term, term, term, term, term];
    }

    // 3. Hitung total baris terfilter
    let recordsFiltered = recordsTotal;
    if (whereClause !== '') {
      const [filteredRows] = await pool.query(
        `SELECT COUNT(*) as total FROM \`user\` ${whereClause}`,
        queryParams
      );
      recordsFiltered = filteredRows[0].total;
    }

    // 4. Fetch data terpaginasi
    const dataQuery = `
      SELECT island_name, region_name, area_name, branch_name, branch_id, island_remap_by_ops, email, \`role\`
      FROM \`user\`
      ${whereClause}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataQuery, [...queryParams, parsedLength, parsedStart]);

    // Clean response format
    const data = rows.map(r => [
      r.island_name || '',
      r.region_name || '',
      r.area_name || '',
      r.branch_name || '',
      r.branch_id || '',
      r.island_remap_by_ops || '',
      r.email || '',
      r.role || ''
    ]);

    return res.status(200).json({
      draw: parsedDraw,
      recordsTotal: recordsTotal,
      recordsFiltered: recordsFiltered,
      data: data
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Database Testing Error: ' + error.message
    });
  }
};
