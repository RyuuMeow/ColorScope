/**
 * ColorMath — Color space conversions & perception calculations
 */

/**
 * RGB [0-255] → HSL { h: 0-360, s: 0-100, l: 0-100 }
 */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * RGB [0-255] → HSV { h: 0-360, s: 0-100, v: 0-100 }
 */
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h, s = max === 0 ? 0 : d / max, v = max;

  if (max === min) {
    h = 0;
  } else {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100)
  };
}

/**
 * RGB → HEX string
 */
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

/**
 * sRGB linearization for accurate luminance
 */
function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Perceived brightness (Relative Luminance) ITU-R BT.709
 * Returns 0-100
 */
export function perceivedBrightness(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const Y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  return Math.round(Y * 100);
}

/**
 * Simple brightness (non-linearized) for quick UI display
 * Returns 0-100
 */
export function simpleBrightness(r, g, b) {
  return Math.round((0.299 * r + 0.587 * g + 0.114 * b) / 2.55);
}

/**
 * Color temperature classification
 * Returns: '冷色', '暖色', '中性'
 */
export function colorTemperature(h, s) {
  if (s < 10) return '中性';
  // Warm: 0-60, 330-360 (red, orange, yellow)
  if ((h >= 0 && h <= 60) || h >= 330) return '暖色';
  // Cool: 180-270 (cyan, blue, purple)
  if (h >= 180 && h <= 270) return '冷色';
  // Transitional
  if (h > 60 && h < 180) return h < 120 ? '暖色' : '冷色';
  return '中性';
}

/**
 * Color temperature category (for stats)
 * Returns: 'warm', 'cool', 'neutral'
 */
export function colorTempCategory(h, s) {
  if (s < 10) return 'neutral';
  if ((h >= 0 && h <= 60) || h >= 330) return 'warm';
  if (h >= 180 && h <= 270) return 'cool';
  if (h > 60 && h < 180) return h < 120 ? 'warm' : 'cool';
  return 'neutral';
}

/**
 * Saturation category label
 */
export function saturationLabel(s) {
  if (s < 20) return '極低飽和';
  if (s < 40) return '低飽和';
  if (s < 60) return '中飽和';
  if (s < 80) return '高飽和';
  return '極高飽和';
}

/**
 * Brightness category label
 */
export function brightnessLabel(l) {
  if (l < 20) return '暗部';
  if (l < 40) return '中暗';
  if (l < 60) return '中間調';
  if (l < 80) return '中亮';
  return '亮部';
}

/**
 * Delta between two colors (simple Euclidean in HSL space, normalized)
 */
export function colorDelta(hsl1, hsl2) {
  const dh = Math.min(Math.abs(hsl1.h - hsl2.h), 360 - Math.abs(hsl1.h - hsl2.h));
  const ds = Math.abs(hsl1.s - hsl2.s);
  const dl = Math.abs(hsl1.l - hsl2.l);

  return {
    deltaH: dh,
    deltaS: ds,
    deltaL: dl,
    distance: Math.round(Math.sqrt(dh * dh + ds * ds + dl * dl))
  };
}

/**
 * Apply grayscale to RGBA pixel data (in-place on a copy)
 */
export function grayscalePixel(r, g, b) {
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return [gray, gray, gray];
}

/**
 * Generate a saturation heatmap color for a given saturation value (0-100)
 * Low sat → dark blue, High sat → bright red/yellow
 */
export function saturationHeatColor(saturation) {
  const t = saturation / 100;
  // Cold (blue) → Hot (red/yellow)
  const r = Math.round(255 * Math.min(1, t * 2));
  const g = Math.round(255 * Math.max(0, t < 0.5 ? t * 2 : 2 - t * 2));
  const b = Math.round(255 * Math.max(0, 1 - t * 2));
  return [r, g, b];
}

/**
 * Check if hue is within a range (handles wrap-around at 360)
 */
export function hueInRange(h, start, end) {
  if (start <= end) return h >= start && h <= end;
  return h >= start || h <= end;
}

/**
 * Human-readable color name in Chinese based on HSL
 */
export function colorName(h, s, l) {
  if (s < 8) {
    if (l < 15) return '純黑';
    if (l < 35) return '深灰';
    if (l < 65) return '灰色';
    if (l < 85) return '淺灰';
    return '純白';
  }
  const prefix = l < 30 ? '深' : l < 45 ? '暗' : l > 80 ? '淺' : l > 65 ? '亮' : '';
  const warmCool = (h >= 15 && h < 75) || (h >= 330) ? '暖' : (h >= 180 && h < 300) ? '冷' : '';
  let base;
  if (h < 15 || h >= 345) base = '紅';
  else if (h < 35) base = '橙';
  else if (h < 55) base = '黃';
  else if (h < 75) base = '黃綠';
  else if (h < 150) base = '綠';
  else if (h < 180) base = '青綠';
  else if (h < 210) base = '青';
  else if (h < 250) base = '藍';
  else if (h < 290) base = '紫';
  else if (h < 330) base = '粉紫';
  else base = '桃紅';
  return (prefix || warmCool) + base;
}
