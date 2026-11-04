// Prevent NoSQL injection.
//
// Attack: POST /login { "email": "a@b.com", "password": { "$ne": null } }
// If that object reached a Mongo query, `$ne: null` would match ANY password.
// We strip keys starting with "$" or containing "." from body/query/params.
// (Zod validation also rejects non-string values - defence in depth.)

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete value[key];
      } else {
        value[key] = clean(value[key]);
      }
    }
  }
  return value;
}

function sanitize(req, _res, next) {
  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
}

module.exports = sanitize;
