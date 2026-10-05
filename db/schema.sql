-- Run once on a new database. Safe to run again.
CREATE TABLE IF NOT EXISTS reports (
  code       text PRIMARY KEY,                -- what the user keeps, e.g. LPR-7KQ2-M9XA
  status     text NOT NULL DEFAULT 'terkirim'
             CHECK (status IN ('terkirim', 'diterima', 'diproses', 'selesai')),
  report     jsonb NOT NULL,                  -- SAPA fields, see lib/sapa.ts
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
