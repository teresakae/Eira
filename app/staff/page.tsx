// Fake SAPA 129 staff dashboard: /staff (password: STAFF_PASSWORD in .env.local).
// Lists incoming reports and lets staff change their status. Plain on purpose: it's a demo stand-in.
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { refresh } from 'next/cache';
import { sql, STATUSES } from '@/lib/db';
import { isStaff } from '@/lib/staff';

// SAPA's own wording for each field.
const FIELDS: Record<string, string> = {
  is_victim: 'Korban', level_concern: 'Tingkat kekhawatiran', relationship_with_victim: 'Hubungan pelaku dengan korban',
  incident_time: 'Waktu kejadian', location: 'Tempat kejadian', province_city: 'Kota / provinsi', description: 'Kronologi',
  korban_fullname: 'Nama korban', korban_gender: 'Jenis kelamin korban', korban_age: 'Usia korban',
  korban_disabilities: 'Disabilitas', korban_disabilities_type: 'Jenis disabilitas',
  korban_contact_number: 'No. HP korban', korban_trusted_person: 'No. HP orang dewasa terpercaya',
  reporter_fullname: 'Nama pelapor', anonymous: 'Anonim', contact_number: 'No. HP pelapor',
  category: 'Jenis kekerasan', intensity: 'Intensitas',
};

async function setStatus(form: FormData) {
  'use server';
  // Server actions can be called from anywhere, so check the password here too, not just in proxy.ts.
  if (!isStaff((await headers()).get('authorization'))) throw new Error('Unauthorized');
  const status = String(form.get('status'));
  if (!STATUSES.includes(status)) throw new Error('Unknown status');
  await sql`UPDATE reports SET status = ${status}, updated_at = now() WHERE code = ${String(form.get('code'))}`;
  refresh();
}

const show = (v: unknown) =>
  v === null || v === undefined || v === '' ? '—'
  : v === true ? 'Ya' : v === false ? 'Tidak'
  : Array.isArray(v) ? v.join(', ') || '—'
  : String(v).replaceAll('_', ' ');

const when = (d: string) => new Date(d).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });

export default async function Staff() {
  await connection(); // read the DB on every visit, not once at build time
  const rows = await sql`SELECT code, status, report, created_at FROM reports ORDER BY created_at DESC LIMIT 200`;
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 16, fontFamily: 'system-ui', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22 }}>SAPA 129 · Laporan masuk <small style={{ fontWeight: 400, opacity: 0.6 }}>(demo)</small></h1>
      {rows.length === 0 && <p>Belum ada laporan.</p>}
      {rows.map(r => (
        <details key={r.code} style={{ border: '1px solid #8884', borderRadius: 8, padding: '10px 14px', margin: '10px 0' }}>
          <summary style={{ cursor: 'pointer' }}>
            <b>{r.code}</b> · {when(r.created_at)} · <b>{r.status}</b> · {show(r.report.category)} · {show(r.report.province_city)}
          </summary>
          <form action={setStatus} style={{ margin: '12px 0' }}>
            <input type="hidden" name="code" value={r.code} />
            <label>Status{' '}
              <select name="status" defaultValue={r.status}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>{' '}
            <button>Simpan</button>
          </form>
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, max-content) 1fr', gap: '4px 16px', margin: 0 }}>
            {Object.entries(FIELDS).map(([key, label]) => [
              <dt key={key} style={{ opacity: 0.7 }}>{label}</dt>,
              <dd key={key + ':v'} style={{ margin: 0 }}>{show(r.report[key])}</dd>,
            ])}
          </dl>
        </details>
      ))}
    </main>
  );
}
