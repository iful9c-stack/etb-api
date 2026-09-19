const mysql = require('mysql2/promise');

// Connection Pool untuk koneksi cepat
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Mengambil input email dari Query Params (GET) atau Body (POST)
  let email = req.query.email || (req.body && req.body.email);

  if (!email) {
    return res.status(400).json({
      status: false,
      message: 'Param `email` wajib diisi.'
    });
  }

  email = email.trim();

  try {
    // Prepared statement untuk keamanan dari SQL Injection
    const query = `
      SELECT island_name, region_name, area_name, branch_name, branch_id, island_remap_by_ops, email, \`role\` 
      FROM \`user\` 
      WHERE email = ?
    `;

    const [rows] = await pool.query(query, [email]);

    if (rows.length === 0) {
      return res.status(404).json({
        status: false,
        message: 'User tidak ditemukan',
        data: null
      });
    }

    return res.status(200).json({
      status: true,
      message: 'User ditemukan',
      data: rows[0]
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Database Error: ' + error.message,
      data: null
    });
  }
};
