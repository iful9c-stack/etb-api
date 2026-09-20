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

  let area = req.query.area || (req.body && req.body.area);
  let search = req.query.search || (req.body && req.body.search);
  let page = parseInt(req.query.page || (req.body && req.body.page) || 1);
  let limit = parseInt(req.query.limit || (req.body && req.body.limit) || 10);

  if (!area) {
    return res.status(400).json({ status: false, message: 'Parameter `area` wajib diisi.' });
  }

  area = String(area).trim();
  search = search ? String(search).trim() : '';
  page = Math.max(1, page);
  limit = Math.max(1, Math.min(100, limit));
  const offset = (page - 1) * limit;

  try {
    // 1. Eksekusi Paralel (Total Keseluruhan & Main Query diproses bersamaan)
    const countTotalPromise = pool.query(
      'SELECT COUNT(*) AS total FROM data WHERE `Area` = ?',
      [area]
    );

    // 2. Susun Filter Search Teroptimasi
    let searchSql = '';
    let searchParams = [];

    if (search !== '') {
      const searchKeyword = `%${search}%`;
      const isNumeric = /^\d+$/.test(search);

      // Pisahkan kolom angka & teks agar database tidak melakukan scan di semua kolom secara buta
      let targetColumns = [];
      if (isNumeric) {
        targetColumns = [
          'd.`customer number`',
          'd.`Loan ID`',
          'd.`majelis ID`',
          'd.`NIK BP`',
          'd.`No_HP`',
          'd.`no ketua majelis`',
          'r.`feedback_contact_number`'
        ];
      } else {
        targetColumns = [
          'd.`BP Majelis`',
          'd.`Customer Name`',
          'd.`Branch`',
          'd.`majelis_Name`',
          'd.`Nama Ketua Majelis`',
          'd.`address`',
          'r.`tanggapan_mitra`',
          'r.`alasan`',
          'r.`reason`',
          'r.`validation`',
          'r.`validation_by`'
        ];
      }

      const conditions = targetColumns.map(col => `${col} LIKE ?`).join(' OR ');
      searchSql = ` AND (${conditions})`;
      targetColumns.forEach(() => searchParams.push(searchKeyword));
    }

    // 3. Main Query Cepat Tanpa CTE Berat (Gunakan Subquery Langsung pada ID Response Terakhir)
    const dataSql = `
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
      LEFT JOIN response r ON r.id = (
        SELECT r2.id FROM response r2 
        WHERE r2.customer_number = d.\`customer number\` 
        ORDER BY r2.id DESC LIMIT 1
      )
      WHERE d.\`Area\` = ? ${searchSql}
      LIMIT ? OFFSET ?
    `;

    // Query Total Data Terfilter
    const countFilteredSql = `
      SELECT COUNT(*) AS total
      FROM data d
      LEFT JOIN response r ON r.id = (
        SELECT r2.id FROM response r2 
        WHERE r2.customer_number = d.\`customer number\` 
        ORDER BY r2.id DESC LIMIT 1
      )
      WHERE d.\`Area\` = ? ${searchSql}
    `;

    // Jalankan Query Data & Count Terfilter secara Paralel
    const [
      [totalRows],
      [rows],
      [filteredRows]
    ] = await Promise.all([
      countTotalPromise,
      pool.query(dataSql, [area, ...searchParams, limit, offset]),
      pool.query(countFilteredSql, [area, ...searchParams])
    ]);

    const totalKeseluruhanData = totalRows[0].total;
    const totalDataFiltered = filteredRows[0].total;
    const totalHalaman = Math.ceil(totalDataFiltered / limit);

    return res.status(200).json({
      status: true,
      message: rows[0].length > 0 
        ? `Data lead untuk area '${area}' ditemukan.` 
        : `Tidak ada data lead untuk area '${area}'.`,
      pagination: {
        total_keseluruhan_data: totalKeseluruhanData,
        total_data: totalDataFiltered,
        total_halaman: totalHalaman,
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
