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

  // Menerima input dari GET (Query String) maupun POST (Body)
  let area = req.query.area || (req.body && req.body.area);
  let search = req.query.search || (req.body && req.body.search);
  let page = parseInt(req.query.page || (req.body && req.body.page) || 1);
  let limit = parseInt(req.query.limit || (req.body && req.body.limit) || 10);

  if (!area) {
    return res.status(400).json({
      status: false,
      message: 'Parameter `area` wajib diisi.'
    });
  }

  area = String(area).trim();
  search = search ? String(search).trim() : '';
  page = Math.max(1, page);
  limit = Math.max(1, Math.min(100, limit)); // Maksimal limit 100 per halaman
  const offset = (page - 1) * limit;

  try {
    // 1. Kondisi Dasar Filter Area
    let whereClause = 'WHERE d.`Area` = ?';
    let queryParams = [area];

    // 2. Fitur Global Search (Pencarian Keyword ke Semua Kolom)
    if (search !== '') {
      const searchKeyword = `%${search}%`;
      
      const searchableColumns = [
        'd.`BP Majelis`',
        'd.`customer number`',
        'd.`Customer Name`',
        'd.`Campaign`',
        'd.`Pulau`',
        'd.`Regional`',
        'd.`Area`',
        'd.`Branch`',
        'd.`Loan ID`',
        'd.`majelis ID`',
        'd.`majelis_Name`',
        'd.`no ketua majelis`',
        'd.`Nama Ketua Majelis`',
        'd.`NIK BP`',
        'd.`address`',
        'd.`No_HP`',
        'r.`tanggapan_mitra`',
        'r.`alasan`',
        'r.`tanggal_follow_up`',
        'r.`validation`',
        'r.`validation_by`',
        'r.`tanggapam_original`',
        'r.`validation AM`',
        'r.`validation RM`',
        'r.`validation HO`',
        'r.`feedback_contact_number`',
        'r.`reason`'
      ];

      // Menggabungkan seluruh kolom dengan kondisi OR LIKE ?
      const searchConditions = searchableColumns.map(col => `${col} LIKE ?`).join(' OR ');
      
      whereClause += ` AND (${searchConditions})`;
      
      // Push keyword ke queryParams sebanyak kolom pencarian
      searchableColumns.forEach(() => {
        queryParams.push(searchKeyword);
      });
    }

    // 3. Query Hitung Total Record (Untuk Paginasi)
    const countQuery = `
      SELECT COUNT(DISTINCT d.\`customer number\`) AS total
      FROM data d
      LEFT JOIN response r
        ON r.id = (
            SELECT r2.id
            FROM response r2
            WHERE r2.\`customer_number\` = d.\`customer number\`
            ORDER BY TIMESTAMP(r2.\`timestamp\`) DESC, r2.id DESC
            LIMIT 1
        )
      ${whereClause}
    `;

    const [countRows] = await pool.query(countQuery, queryParams);
    const totalRecords = countRows[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    // 4. Query Utama Ambil Data (Sesuai Limit & Offset Paginasi)
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
      FROM data d
      LEFT JOIN response r
        ON r.id = (
            SELECT r2.id
            FROM response r2
            WHERE r2.\`customer_number\` = d.\`customer number\`
            ORDER BY TIMESTAMP(r2.\`timestamp\`) DESC, r2.id DESC
            LIMIT 1
        )
      ${whereClause}
      LIMIT ? OFFSET ?
    `;

    // Append limit dan offset ke queryParams
    const fetchParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(dataQuery, fetchParams);

    return res.status(200).json({
      status: true,
      message: rows.length > 0 
        ? `Data lead untuk area '${area}' ditemukan.` 
        : `Tidak ada data lead untuk area '${area}'.`,
      pagination: {
        total_records: totalRecords,
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
