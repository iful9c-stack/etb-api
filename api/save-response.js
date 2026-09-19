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

// Daftar seluruh kolom yang diperbolehkan di tabel response
const ALLOWED_COLUMNS = [
  'customer_number',
  'customer_name',
  'tanggapan_mitra',
  'alasan',
  'tanggal_follow_up',
  'email',
  'timestamp',
  'validation',
  'validation_by',
  'tanggapam_original',
  'validation AM',
  'validation RM',
  'validation HO',
  'feedback_contact_number',
  'reason'
];

module.exports = async (req, res) => {
  // CORS Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      status: false,
      message: 'Method tidak diizinkan. Gunakan POST.'
    });
  }

  let body = req.body;

  // Jika payload dikirim sebagai string JSON
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ status: false, message: 'Format JSON payload tidak valid.' });
    }
  }

  // Boleh menerima objek tunggal atau array
  const items = Array.isArray(body) ? body : [body];

  if (!items || items.length === 0) {
    return res.status(400).json({
      status: false,
      message: 'Payload kosong. Harap kirimkan array atau objek data.'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let insertedCount = 0;
    let updatedCount = 0;
    const errors = [];

    // Format ISO string untuk timestamp default (misal: "2026-03-20 14:30:00")
    const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const customerNumber = item.customer_number ? String(item.customer_number).trim() : null;

      // Validasi customer_number wajib ada
      if (!customerNumber) {
        errors.push({ index: i, message: 'Field `customer_number` wajib diisi.' });
        continue;
      }

      // Set timestamp default jika tidak dikirim dari payload
      if (!item.timestamp) {
        item.timestamp = nowIso;
      }

      // 1. Cari record terbaru berdasarkan customer_number (ORDER BY TIMESTAMP DESC, id DESC)
      const [latestRows] = await connection.query(
        `SELECT id, tanggapan_mitra 
         FROM response 
         WHERE customer_number = ? 
         ORDER BY TIMESTAMP(\`timestamp\`) DESC, id DESC 
         LIMIT 1`,
        [customerNumber]
      );

      const hasExisting = latestRows.length > 0;
      const latestTanggapan = hasExisting ? String(latestRows[0].tanggapan_mitra || '').trim() : '';

      // Logika Penentuan Action:
      // - Jika BELUM ADA customer_number -> INSERT
      // - Jika SUDAH ADA dan tanggapan_mitra TERBARU == 'Follow Up FO' -> INSERT
      // - Jika SUDAH ADA dan tanggapan_mitra TERBARU != 'Follow Up FO' -> UPDATE row id tersebut
      const isInsert = !hasExisting || (latestTanggapan.toLowerCase() === 'follow up fo');

      if (isInsert) {
        // --- PROSES INSERT ---
        const keys = [];
        const values = [];

        for (const col of ALLOWED_COLUMNS) {
          if (item[col] !== undefined && item[col] !== null) {
            keys.push(`\`${col}\``);
            values.push(String(item[col])); // Konversi ke text
          }
        }

        if (keys.length > 0) {
          const insertQuery = `
            INSERT INTO response (${keys.join(', ')})
            VALUES (${keys.map(() => '?').join(', ')})
          `;
          await connection.query(insertQuery, values);
          insertedCount++;
        }

      } else {
        // --- PROSES UPDATE ---
        const targetId = latestRows[0].id;
        const updateFields = [];
        const updateValues = [];

        for (const col of ALLOWED_COLUMNS) {
          // Jangan update customer_number atau field yang tidak dikirim di payload
          if (col !== 'customer_number' && item[col] !== undefined && item[col] !== null) {
            updateFields.push(`\`${col}\` = ?`);
            updateValues.push(String(item[col]));
          }
        }

        if (updateFields.length > 0) {
          updateValues.push(targetId);
          const updateQuery = `
            UPDATE response 
            SET ${updateFields.join(', ')} 
            WHERE id = ?
          `;
          await connection.query(updateQuery, updateValues);
          updatedCount++;
        }
      }
    }

    await connection.commit();

    return res.status(200).json({
      status: true,
      message: 'Proses simpan data selesai.',
      summary: {
        total_processed: items.length,
        inserted: insertedCount,
        updated: updatedCount,
        failed: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    await connection.rollback();
    return res.status(500).json({
      status: false,
      message: 'Database Error: ' + error.message
    });
  } finally {
    connection.release();
  }
};
