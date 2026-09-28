/** Errores de dominio: los endpoints los traducen a códigos HTTP. */
export class NotFoundError extends Error {}
export class AccessDeniedError extends Error {}
/** Datos que no cumplen una regla de negocio (400). */
export class ValidationError extends Error {}
/** La operación no se puede hacer en el estado actual (409), p. ej. regenerar una factura pagada. */
export class ConflictError extends Error {}
