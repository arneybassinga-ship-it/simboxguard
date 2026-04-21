import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3310', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'rootpassword',
  database: process.env.MYSQL_DATABASE || 'soutenance',
  waitForConnections: true,
  connectionLimit: 2,
});

const resetDemoData = async () => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('DELETE FROM sanctions');
    await conn.query('DELETE FROM ordres_blocage');
    await conn.query('DELETE FROM rapports');
    await conn.query('DELETE FROM simbox_detectees');
    await conn.query('DELETE FROM cdr_files');

    await conn.commit();
    console.log('Donnees metier supprimees: cdr_files, rapports, ordres, sanctions, simbox_detectees.');
  } catch (error) {
    await conn.rollback();
    console.error('[RESET DEMO DATA ERROR]', error);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
};

resetDemoData();
