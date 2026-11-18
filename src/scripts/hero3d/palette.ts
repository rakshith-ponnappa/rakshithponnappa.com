/** OKLCH → gamma-encoded sRGB (clamped), which is what a default WebGL canvas expects. Hue in degrees. */
export function oklch(L: number, C: number, h: number): number[] {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const enc = (v: number) => {
    v = Math.min(1, Math.max(0, v));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  };
  return [
    enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export type ThemeName = 'dark' | 'light';

const pack = (cols: number[][], params: number[]) => new Float32Array([...cols.flatMap((c) => [...c, 1]), ...params]);

/**
 * Shader palette, 8 × vec4: role, case study, project, deploy amber, ink (tracks), signal (ports and highlights),
 * then [node alpha, line alpha, packet alpha, glow] and [halo strength, ring alpha, light ink weight, 0].
 * Hues match the site tokens in src/styles/global.css.
 */
export const THEMES: Record<ThemeName, Float32Array> = {
  dark: pack(
    [oklch(0.84, 0.19, 150), oklch(0.74, 0.13, 240), oklch(0.8, 0.04, 240), oklch(0.82, 0.16, 80), oklch(0.62, 0.035, 250), oklch(0.84, 0.19, 150)],
    [1, 0.55, 1, 1, 0.8, 0.5, 0, 0],
  ),
  light: pack(
    [oklch(0.5, 0.14, 150), oklch(0.5, 0.13, 240), oklch(0.42, 0.02, 255), oklch(0.62, 0.15, 65), oklch(0.36, 0.015, 255), oklch(0.5, 0.14, 150)],
    [0.95, 0.5, 0.8, 0, 0.12, 0.55, 1, 0],
  ),
};

export function readTheme(): ThemeName {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
