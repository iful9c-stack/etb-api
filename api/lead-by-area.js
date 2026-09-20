const mysql = require('mysql2/promise');

// Connection Pool
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

  // Ambil parameter area dari Query String (GET) atau Body (POST)
  let area = req.query.area || (req.body && req.body.area);

  if (!area) {
    return res.status(400).json({
      status: false,
      message: 'Parameter `area` wajib diisi.'
    });
  }

  area = area.trim();

  try {
    const query = `
      SELECT
        d.\`BP Majelis\`,
        d.\`customer number\`,
        d.\`Customer Name\`,
        d.Campaign,
        d.Pulau,
        d.Regional,
        d.Area,
        d.Branch,
        d.\`Loan ID\`,
        d.\`Jumlah Loan Aktif\`,
        d.Plafond,
        d.\`Loan cycle\`,
        d.Week,
        d.\`majelis ID\`,
        d.majelis_Name,
        d.\`Hari Kumpulan\`,
        d.\`no ketua majelis\`,
        d.\`Nama Ketua Majelis\`,
        d.\`NIK BP\`,
        d.address,
        d.No_HP,
        d.\`Sisa Angsuran\`,
        d.\`Potential Disbursement\`,
        d.\`Flagging Mitra\`,
        d.\`Have Credit Limit Increase\`,
        d.Prioritas,
        r.tanggapan_mitra,
        r.alasan,
        r.tanggal_follow_up,
        r.validation,
        r.validation_by,
        r.tanggapam_original,
        r.\`validation AM\`,
        r.\`validation RM\`,
        r.\`validation HO\`,
        r.feedback_contact_number,
        r.reason
      FROM data d
      LEFT JOIN response r
        ON r.id = (
            SELECT r2.id
            FROM response r2
            WHERE r2.\`customer_number\` = d.\`customer number\`
            ORDER BY TIMESTAMP(r2.\`timestamp\`) DESC, r2.id DESC
            LIMIT 1
        )
      WHERE d.\`Area\` = ?
    `;

    const [rows] = await pool.query(query, [area]);

    return res.status(200).json({
      status: true,
      message: rows.length > 0 ? `Data lead untuk area '${area}' ditemukan.` : `Tidak ada data lead untuk area '${area}'.`,
      total: rows.length,
      data: rows
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: 'Database Error: ' + error.message,
      data: null
    });
  }
};
