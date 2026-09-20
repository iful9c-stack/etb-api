const mysql = require('mysql2/promise');

// Singleton Connection Pool (Mencegah Error "Too many connections")
let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'mysql-38a538aa-iful9c-fbda.d.aivencloud.com',
      port: parseInt(process.env.MYSQL_PORT || '16305'),
      database: process.env.MYSQL_DATABASE || 'etb',
      user: process.env.MYSQL_USER || 'avnadmin',
      password: process.env.MYSQL_PASSWORD || 'AVNS_RtK8bP4lVAIYuuZCblw',
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }
  return pool;
}

module.exports = async (req, res) => {
  // CORS Preflight Header
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parameter
  let pulau = req.query.pulau || (req.body && req.body.pulau);
  let page = parseInt(req.query.page || (req.body && req.body.page) || 1);
  let limit = parseInt(req.query.limit || (req.body && req.body.limit) || 10);

  if (!pulau) {
    return res.status(400).json({
      status: false,
      message: 'Parameter `pulau` wajib diisi.'
    });
  }

  pulau = pulau.trim();
  page = Math.max(1, page);
  limit = Math.max(1, limit);
  const offset = (page - 1) * limit;

  try {
    const db = getPool();

    // 1. Query Total Data (Hitung Paginasi)
    const countQuery = `SELECT COUNT(*) AS total FROM data WHERE \`Pulau\` = ?`;

    // 2. Query Utama Ter-Optimasi (Potong data dulu dengan LIMIT, baru JOIN)
    const dataQuery = `
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
      FROM (
        SELECT * FROM data 
        WHERE \`Pulau\` = ? 
        LIMIT ? OFFSET ?
      ) d
      LEFT JOIN response r 
        ON r.id = (
          SELECT r2.id 
          FROM response r2 
          WHERE r2.\`customer_number\` = d.\`customer number\` 
          ORDER BY r2.id DESC 
          LIMIT 1
        )
    `;

    // Jalankan query secara paralel
    const [[countResult], [rows]] = await Promise.all([
      db.query(countQuery, [pulau]),
      db.query(dataQuery, [pulau, limit, offset])
    ]);

    const totalData = countResult[0].total;
    const totalPages = Math.ceil(totalData / limit);

    return res.status(200).json({
      status: true,
      message: rows.length > 0 
        ? `Data lead untuk pulau '${pulau}' ditemukan.` 
        : `Tidak ada data lead untuk pulau '${pulau}'.`,
      pagination: {
        total_data: totalData,
        total_pages: totalPages,
        current_page: page,
        per_page: limit,
        has_next_page: page < totalPages,
        has_prev_page: page > 1
      },
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
