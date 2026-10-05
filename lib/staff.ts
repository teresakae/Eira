// Login for the fake SAPA staff dashboard: one shared password (STAFF_PASSWORD),
// asked for by the browser's built-in login box (HTTP Basic auth). Any username works.
// ponytail: plain string compare and one shared password, fine for a demo. Real staff need real accounts.
export function isStaff(authorization: string | null) {
  const password = process.env.STAFF_PASSWORD;
  if (!password || !authorization?.startsWith('Basic ')) return false;
  const given = atob(authorization.slice(6)).split(':').slice(1).join(':');
  return given === password;
}
