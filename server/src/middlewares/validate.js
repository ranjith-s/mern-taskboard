const { z } = require('zod');
const AppError = require('../utils/AppError');

/**
 * validate({ body: schema, params: schema, query: schema })
 *
 * Parses each part of the request. On success the parsed (and therefore
 * cleaned + type-coerced) values replace the originals, so controllers can
 * trust req.body. Unknown keys are stripped by zod objects by default,
 * which also blocks mass-assignment (e.g. sending { role: 'owner' }).
 */
const validate = (schemas) => (req, _res, next) => {
  const errors = [];

  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] ?? {});
    if (result.success) {
      req[key] = result.data;
    } else {
      for (const issue of result.error.issues) {
        errors.push({ field: [key, ...issue.path].join('.'), message: issue.message });
      }
    }
  }

  if (errors.length) return next(AppError.badRequest('Validation failed', errors));
  next();
};

// Shared helpers for schemas
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

module.exports = { validate, objectId };
