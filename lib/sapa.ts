// SAPA 129 report format, mirrored from laporsapa129.kemenpppa.go.id/lapor (Oct 2026).
// Dropdown values are copied exactly so a report can be pasted into the real form.
// "darurat" isn't here: every report from this app is "tidak darurat".

const RELATIONSHIPS = [
  'Orang Tidak Dikenal', 'Diri Sendiri', 'Kenalan Baru', 'Pengurus Rumah Tangga', 'Guru', 'Lainnya',
  'Petugas Layanan', 'Petugas Sekolah', 'Teman', 'Suami/Istri', 'Tetangga/ Teman keluarga', 'Kerabat',
  'Ayah Kandung', 'Ibu Kandung', 'Pengasuh Utama', 'Anak', 'Pacar', 'Rekan Kerja', 'Atasan / Majikan',
];
const DISABILITY_TYPES = [
  'Mengalami kesulitan melihat, meskipun memakai kacamata',
  'Mengalami kesulitan mendengar, meskipun menggunakan alat bantu dengar',
  'Mengalami kesulitan berkomunikasi, misalnya memahami atau dimengerti',
  'Mengalami kesulitan mengingat atau berkonsentrasi',
  'Mengalami kesulitan dengan perawatan diri seperti membersihkan seluruh tubuh atau berpakaian',
  'Mengalami kesulitan berjalan atau menaiki tangga',
];

const oneOf = (values: string[], description: string) => ({ type: ['string', 'null'], enum: [...values, null], description });
const text = (description: string) => ({ type: ['string', 'null'], description });
const yesNo = (description: string) => ({ type: ['boolean', 'null'], description });

// JSON Schema for Gemini structured output. null = not said yet.
export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    is_victim: oneOf(['saya_sendiri', 'orang_lain'], 'Did it happen to the user (saya_sendiri), or did they see/hear it happen to someone else (orang_lain)?'),
    level_concern: oneOf(['sedikit_khawatir', 'khawatir', 'sangat_khawatir'], 'How worried the user is'),
    relationship_with_victim: oneOf(RELATIONSHIPS, "Perpetrator's relationship to the victim"),
    incident_time: oneOf(['Pagi', 'Siang', 'Sore', 'Malam', 'Tidak Diketahui'], 'Time of day it happened'),
    location: oneOf(['Rumah Tangga', 'Tempat Kerja', 'Sekolah/Kampus', 'Sarana Umum', 'Situasi Darurat/Tempat Bencana', 'Daring/Elektronik'], 'Type of place it happened'),
    province_city: text('City and province, e.g. "Kota Bandung, Jawa Barat" or "Kota Jakarta Selatan, DKI Jakarta"'),
    description: text('What happened, in Indonesian, in order, using only what the user said'),
    korban_fullname: text("Victim's name (optional)"),
    korban_gender: oneOf(['laki-laki', 'perempuan'], "Victim's gender"),
    korban_age: { type: ['integer', 'null'], minimum: 1, maximum: 100, description: "Victim's age in years" },
    korban_disabilities: yesNo('Does the victim have a disability?'),
    korban_disabilities_type: oneOf(DISABILITY_TYPES, 'Type of disability, only if they have one'),
    korban_contact_number: text("Victim's phone number, digits only (optional)"),
    korban_trusted_person: text("Phone number of an adult the victim trusts, digits only (optional)"),
    reporter_fullname: text("Reporter's name"),
    anonymous: yesNo('Does the reporter want to stay anonymous?'),
    contact_number: text("Reporter's phone number, digits only (optional in this app; SAPA's own form requires it)"),
    // Our tags, not SAPA fields: used for tone and for the staff dashboard.
    category: {
      type: 'array',
      items: { type: 'string', enum: ['fisik', 'psikis', 'seksual', 'penelantaran', 'eksploitasi', 'perdagangan_orang', 'lainnya'] },
      description: 'Kinds of violence described',
    },
    intensity: oneOf(['tinggi', 'sedang', 'reflektif'], 'tinggi = heavy or just happened, sedang = happened a while ago, reflektif = mostly wants to talk it through'),
  },
  required: [
    'is_victim', 'level_concern', 'relationship_with_victim', 'incident_time', 'location', 'province_city',
    'description', 'korban_fullname', 'korban_gender', 'korban_age', 'korban_disabilities', 'korban_disabilities_type',
    'korban_contact_number', 'korban_trusted_person', 'reporter_fullname', 'anonymous', 'contact_number',
    'category', 'intensity',
  ],
};

export type Report = Record<string, unknown>;

// What the live AI is told to ask about, in plain words.
export const LABELS: Record<string, string> = {
  is_victim: 'whether it happened to them or someone else',
  level_concern: 'how worried they are',
  relationship_with_victim: 'who did it and their relationship to the victim',
  incident_time: 'what time of day it happened',
  location: 'what kind of place it happened',
  province_city: 'which city and province',
  description: 'what happened',
  korban_gender: "the victim's gender",
  korban_age: "the victim's age",
  korban_disabilities: 'whether the victim has a disability',
  korban_disabilities_type: "what kind of disability the victim has",
  reporter_fullname: "the reporter's name, or whether they'd like to stay anonymous",
};

// Required fields still empty. Empty list = ready to submit.
// Same as SAPA's form, except the phone number: users may submit without one.
export function missing(r: Report): string[] {
  const empty = (k: string) => r[k] === null || r[k] === undefined || r[k] === '';
  const required = [
    'is_victim', 'level_concern', 'relationship_with_victim', 'incident_time', 'location',
    'province_city', 'description', 'korban_gender', 'korban_age', 'korban_disabilities',
  ];
  if (r.korban_disabilities === true) required.push('korban_disabilities_type');
  if (r.anonymous !== true) required.push('reporter_fullname');
  return required.filter(empty);
}
