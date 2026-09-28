export type Theme = 'light' | 'dark';

export const THEME_COOKIE = 'theme';

/** Claro por defecto: solo un valor explícito "dark" activa el modo oscuro. */
export function parseTheme(value: string | undefined): Theme {
  return value === 'dark' ? 'dark' : 'light';
}
