/** Validate req[source] against a zod schema; replaces it with the parsed value. */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return res.status(400).json({ error: issues[0]?.message || 'Invalid input', issues });
  }
  req.valid = req.valid || {};
  req.valid[source] = result.data;
  next();
};
