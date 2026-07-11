// Validación mínima de cuerpos de petición. Lanza un error con `.status = 400`
// para que los wrappers de ruta devuelvan 400 (no 500) ante entradas inválidas.

export class BadRequest extends Error {
  constructor(message, code = 'invalid_request') {
    super(message);
    this.status = 400;
    this.code = code;
  }
}

// Exige que `body` tenga valores no vacíos en cada campo de `fields`.
export function requireFields(body, fields) {
  const b = body || {};
  const missing = fields.filter((f) => b[f] === undefined || b[f] === null || b[f] === '');
  if (missing.length) throw new BadRequest(`Missing required field(s): ${missing.join(', ')}`, 'missing_field');
  return b;
}

// Exige que `body[field]` sea uno de `allowed`.
export function requireEnum(body, field, allowed) {
  const v = (body || {})[field];
  if (!allowed.includes(v)) throw new BadRequest(`Field "${field}" must be one of: ${allowed.join(', ')}`, 'invalid_enum');
  return v;
}

// Exige que `body[field]` sea un array no vacío.
export function requireArray(body, field) {
  const v = (body || {})[field];
  if (!Array.isArray(v) || !v.length) throw new BadRequest(`Field "${field}" must be a non-empty array`, 'invalid_array');
  return v;
}
