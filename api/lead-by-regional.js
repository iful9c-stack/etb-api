const mysql = require('mysql2/promise');

// Konfigurasi Database
const dbConfig = {
  host: process.env.MYSQL_HOST || 'mysql-38a538aa-iful9c-fbda.d.aivencloud.com',
  port: parseInt(process.env.MYSQL_PORT || '16305'),
  database: process.env.MYSQL_DATABASE || 'etb',
  user: process.env.MYSQL_USER || 'avnadmin',
  password: process.env.MYSQL_PASSWORD || 'AVNS_RtK8bP4lVAIYuuZCblw',
  ssl: {
    rejectUnauthorized: false
  }
};

module.exports = async (req, res) => {
  // CORS Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Ambil parameter regional, page, dan limit dari Query String (GET) atau Body (POST)
  let regional = req.query.regional || (req.body && req.body.regional);
  let page = parseInt(req.query.page || (req.body && req.body.page) || 1);
  let limit = parseInt(req.query.limit || (req.body && req.body.limit) || 10);

  if (!regional) {
    return res.status(400).json({
      status: false,
      message: 'Parameter `regional` wajib diisi.'
    });
  }

  regional = regional.trim();
  page = Math.max(1, page);
  limit = Math.max(1, limit);
  const offset = (page - 1) * limit;

  let connection;

  try {
    // 1. Buka Koneksi Baru
    connection = await mysql.createConnection(dbConfig);

    // 2. Query Total Data untuk Hitung Total Halaman
    const countQuery = `SELECT COUNT(*) AS total FROM data WHERE \`Regional\` = ?`;

    // 3. Query Utama Ambil Data dengan Paginasi (Potong data dulu baru JOIN agar cepat)
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
        WHERE \`Regional\` = ? 
        LIMIT ? OFFSET ?
      ) d
      LEFT JOIN response r
        ON r.id = (
            SELECT r2.id
            FROM response r2
            WHERE r2.\`customer_number\` = d.\`customer number\`
            ORDER BY TIMESTAMP(r2.\`timestamp\`) DESC, r2.id DESC
            LIMIT 1
        )
    `;

    // Jalankan kedua query secara berurutan
    const [countResult] = await connection.query(countQuery, [regional]);
    const [rows] = await connection.query(dataQuery, [regional, limit, offset]);

    const totalData = countResult[0].total;
    const totalPages = Math.ceil(totalData / limit);

    return res.status(200).json({
      status: true,
      message: rows.length > 0 
        ? `Data lead untuk regional '${regional}' ditemukan.` 
        : `Tidak ada data lead untuk regional '${regional}'.`,
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
  } finally {
    // 4. SELALU TUTUP KONEKSI (Mencegah "Too many connections")
    if (connection) {
      await connection.end();
    }
  }
};
