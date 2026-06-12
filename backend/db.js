import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host:     process.env.MYSQL_HOST     || 'localhost',
  port:     parseInt(process.env.MYSQL_PORT || '3306', 10),
  user:     process.env.MYSQL_USER     || 'root',
  password: process.env.MYSQL_PASSWORD || 'rootpassword',
  database: process.env.MYSQL_DATABASE || 'soutenance',
  waitForConnections: true,
  connectionLimit: 10,
});

export const waitForDb = async (retries = 10, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await pool.getConnection();
      conn.release();
      return;
    } catch {
      console.log(`[DB] MySQL pas encore prêt, tentative ${i + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Impossible de se connecter à MySQL après plusieurs tentatives');
};
