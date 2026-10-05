// Self-check for missing() and check(): node lib/sapa.check.mjs
import assert from 'node:assert/strict';
import { check, missing } from './sapa.ts';

const full = {
  is_victim: 'saya_sendiri', level_concern: 'khawatir', relationship_with_victim: 'Pacar',
  incident_time: 'Malam', location: 'Rumah Tangga', province_city: 'Kota Bandung, Jawa Barat',
  description: 'Korban dipukul oleh pacarnya.', korban_gender: 'perempuan', korban_age: 19,
  korban_disabilities: false, korban_disabilities_type: null, reporter_fullname: 'Sari',
  anonymous: false, contact_number: '081234567890',
};

assert.deepEqual(missing(full), []);
assert.deepEqual(missing({ ...full, korban_age: null, description: '' }), ['description', 'korban_age']);
assert.deepEqual(missing({ ...full, korban_disabilities: true }), ['korban_disabilities_type']);
assert.deepEqual(missing({ ...full, reporter_fullname: null }), ['reporter_fullname']);
assert.deepEqual(missing({ ...full, reporter_fullname: null, anonymous: true }), []);
assert.deepEqual(missing({ ...full, contact_number: null }), []); // phone is optional
assert.equal(missing({}).length, 11); // nothing said yet: 10 always-required + reporter name

// check(): what the browser sends on submit
const ok = check({ ...full, category: ['fisik'], intensity: 'tinggi', hacker: 'x' });
assert.ok('report' in ok);
assert.equal(ok.report.hacker, undefined);                 // unknown fields dropped
assert.equal(ok.report.korban_trusted_person, null);       // absent fields become null
assert.deepEqual(check({ ...full }).report.category, []);  // absent category becomes []
assert.deepEqual(check({ ...full, location: 'Mars' }).bad, ['location']);
assert.deepEqual(check({ ...full, korban_age: 150 }).bad, ['korban_age']);
assert.deepEqual(check({ ...full, korban_age: '19' }).bad, ['korban_age']);
assert.deepEqual(check({ ...full, anonymous: 'yes' }).bad, ['anonymous']);
assert.deepEqual(check({ ...full, category: ['fisik', 'alien'] }).bad, ['category']);
assert.deepEqual(check({ ...full, description: 'x'.repeat(5001) }).bad, ['description']);
assert.deepEqual(check([]).bad, ['report']);
assert.deepEqual(check(null).bad, ['report']);
console.log('sapa ok');
