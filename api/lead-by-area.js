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
  limit = Math.max(1, Math.min(100, limit));
  const offset = (page - 1) * limit;

  try {
    // 1. Dapatkan Total Keseluruhan Data per Area (Tanpa Search Filter) untuk Performa Cepat
    const [areaTotalRows] = await pool.query(
      'SELECT COUNT(DISTINCT `customer number`) AS total FROM data WHERE `Area` = ?',
      [area]
    );
    const totalKeseluruhanData = areaTotalRows[0].total;

    // 2. Susun Conditional Search Filter
    let searchClause = '';
    let searchParams = [];

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

      const searchConditions = searchableColumns.map(col => `${col} LIKE ?`).join(' OR ');
      searchClause = ` AND (${searchConditions})`;
      
      searchableColumns.forEach(() => {
        searchParams.push(searchKeyword);
      });
    }

    // 3. Query Utama dengan Optimasi CTE (Fast Response & Single Join Index)
    const mainQuery = `
      WITH latest_response AS (
        SELECT r.*
        FROM response r
        INNER JOIN (
          SELECT customer_number, MAX(id) AS max_id
          FROM response
          GROUP BY customer_number
        ) r_max ON r.id = r_max.max_id
      )
      SELECT
        SQL_CALC_FOUND_ROWS
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
      LEFT JOIN latest_response r ON d.\`customer number\` = r.customer_number
      WHERE d.\`Area\` = ? ${searchClause}
      LIMIT ? OFFSET ?
    `;

    const queryParams = [area, ...searchParams, limit, offset];
    const [rows] = await pool.query(mainQuery, queryParams);

    // 4. Ambil Total Data Hasil Filter/Search
    const [filteredCountRows] = await pool.query('SELECT FOUND_ROWS() AS total');
    const totalDataFiltered = filteredCountRows[0].total;
    const totalHalaman = Math.ceil(totalDataFiltered / limit);

    return res.status(200).json({
      status: true,
      message: rows.length > 0 
        ? `Data lead untuk area '${area}' ditemukan.` 
        : `Tidak ada data lead untuk area '${area}'.`,
      pagination: {
        total_keseluruhan_data: totalKeseluruhanData, // Total seluruh data di area tersebut
        total_data: totalDataFiltered,               // Total data setelah dikurangi filter/search
        total_halaman: totalHalaman,                 // Total halaman yang tersedia
        current_page: page,
        per_page: limit,
        has_next_page: page < totalHalaman,
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
