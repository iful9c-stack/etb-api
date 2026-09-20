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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==========================================
  // HANDLER FOR GET: Get Summary by Branch
  // ==========================================
  if (req.method === 'GET') {
    const { branch } = req.query;

    if (!branch) {
      return res.status(400).json({
        status: false,
        message: 'Parameter "branch" wajib diisi. Contoh: ?branch=Wonokromo'
      });
    }

    try {
      const sqlQuery = `
        WITH latest_response AS (
            SELECT r.*
            FROM response r
            INNER JOIN (
                SELECT customer_number, MAX(id) AS max_id
                FROM response
                GROUP BY customer_number
            ) r_max ON r.id = r_max.max_id
        ),
        base_data AS (
            SELECT 
                d.\`NIK BP\`,
                d.\`BP Majelis\` AS nama_bp,
                d.\`customer number\`,
                TRIM(r.tanggapan_mitra) AS tanggapan_mitra
            FROM data d
            LEFT JOIN latest_response r 
                ON d.\`customer number\` = r.customer_number
            WHERE d.\`Branch\` = ?
        )
        SELECT 
            COALESCE(nama_bp, 'Total') AS nama_bp,
            COUNT(DISTINCT \`customer number\`) AS jumlah_leads,
            COUNT(CASE WHEN tanggapan_mitra IS NOT NULL AND tanggapan_mitra != '' THEN 1 END) AS jumlah_yang_diproses,
            
            -- Breakdown Jumlah Status
            COUNT(CASE WHEN tanggapan_mitra = 'Berminat' THEN 1 END) AS berminat,
            COUNT(CASE WHEN tanggapan_mitra = 'Ditolak FO' THEN 1 END) AS ditolak_fo,
            COUNT(CASE WHEN tanggapan_mitra = 'Follow Up FO' THEN 1 END) AS perlu_follow_up,
            COUNT(CASE WHEN tanggapan_mitra = 'Tidak Berminat' THEN 1 END) AS tidak_berminat,
            
            -- Breakdown Persentase (%) terhadap Jumlah Leads
            ROUND(COUNT(CASE WHEN tanggapan_mitra = 'Berminat' THEN 1 END) * 100.0 / NULLIF(COUNT(DISTINCT \`customer number\`), 0), 2) AS berminat_pct,
            ROUND(COUNT(CASE WHEN tanggapan_mitra = 'Ditolak FO' THEN 1 END) * 100.0 / NULLIF(COUNT(DISTINCT \`customer number\`), 0), 2) AS ditolak_fo_pct,
            ROUND(COUNT(CASE WHEN tanggapan_mitra = 'Follow Up FO' THEN 1 END) * 100.0 / NULLIF(COUNT(DISTINCT \`customer number\`), 0), 2) AS perlu_follow_up_pct,
            ROUND(COUNT(CASE WHEN tanggapan_mitra = 'Tidak Berminat' THEN 1 END) * 100.0 / NULLIF(COUNT(DISTINCT \`customer number\`), 0), 2) AS tidak_berminat_pct

        FROM base_data
        GROUP BY nama_bp WITH ROLLUP;
      `;

      const [rows] = await pool.query(sqlQuery, [branch]);

      // Format response JSON
      const formattedData = rows.map(row => ({
        nama_bp: row.nama_bp,
        jumlah_leads: Number(row.jumlah_leads),
        jumlah_yang_diproses: Number(row.jumlah_yang_diproses),
        detail_jumlah: {
          berminat: Number(row.berminat),
          ditolak_fo: Number(row.ditolak_fo),
          perlu_follow_up: Number(row.perlu_follow_up),
          tidak_berminat: Number(row.tidak_berminat)
        },
        detail_persentase: {
          berminat: `${row.berminat_pct || 0}%`,
          ditolak_fo: `${row.ditolak_fo_pct || 0}%`,
          perlu_follow_up: `${row.perlu_follow_up_pct || 0}%`,
          tidak_berminat: `${row.tidak_berminat_pct || 0}%`
        }
      }));

      return res.status(200).json({
        status: true,
        branch: branch,
        data: formattedData
      });

    } catch (error) {
      return res.status(500).json({
        status: false,
        message: 'Database Error: ' + error.message
      });
    }
  }

  // ==========================================
  // HANDLER FOR POST: Save / Upsert Data
  // ==========================================
  if (req.method !== 'POST') {
    return res.status(405).json({
      status: false,
      message: 'Method tidak diizinkan. Gunakan GET atau POST.'
    });
  }

  let body = req.body;

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ status: false, message: 'Format JSON payload tidak valid.' });
    }
  }

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

    const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const customerNumber = item.customer_number ? String(item.customer_number).trim() : null;

      if (!customerNumber) {
        errors.push({ index: i, message: 'Field `customer_number` wajib diisi.' });
        continue;
      }

      if (!item.timestamp) {
        item.timestamp = nowIso;
      }

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

      const isInsert = !hasExisting || (latestTanggapan.toLowerCase() === 'follow up fo');

      if (isInsert) {
        const keys = [];
        const values = [];

        for (const col of ALLOWED_COLUMNS) {
          if (item[col] !== undefined && item[col] !== null) {
            keys.push(`\`${col}\``);
            values.push(String(item[col]));
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
        const targetId = latestRows[0].id;
        const updateFields = [];
        const updateValues = [];

        for (const col of ALLOWED_COLUMNS) {
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
