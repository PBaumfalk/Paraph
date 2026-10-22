export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, msg: string, details?: unknown) => new AppError(400, code, msg, details);
export const unauthorized = (msg = 'Anmeldung erforderlich') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Keine Berechtigung') => new AppError(403, 'forbidden', msg);
// Fremde oder unbekannte Ressourcen sind immer 404 – so verrät die API nicht, ob etwas existiert.
export const notFound = (msg = 'Nicht gefunden') => new AppError(404, 'not_found', msg);
export const conflict = (code: string, msg: string, details?: unknown) => new AppError(409, code, msg, details);
export const gone = (code: string, msg: string) => new AppError(410, code, msg);
export const tooMany = (msg = 'Zu viele Versuche. Bitte später erneut versuchen.') => new AppError(429, 'rate_limited', msg);
