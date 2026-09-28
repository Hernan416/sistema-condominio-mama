export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function jsonError(message: string, status: number): Response {
  return json({ error: message }, status);
}

/** Header Content-Disposition que fuerza la descarga con un nombre de archivo seguro. */
export function attachmentHeader(filename: string): string {
  const ascii = filename.replace(/[^\w.-]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
