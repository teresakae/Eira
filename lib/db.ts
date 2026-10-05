// Postgres on Neon, over HTTP (works on Vercel without a connection pool). Table: db/schema.sql.
import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL!);

// Same order as the CHECK in db/schema.sql.
export const STATUSES = ['terkirim', 'diterima', 'diproses', 'selesai'];
