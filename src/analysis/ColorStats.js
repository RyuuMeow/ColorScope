/**
 * ColorStats — Aggregate color statistics for an image
 */
import { rgbToHsl, colorTempCategory } from '../core/ColorMath.js';

export class ColorStats {
  /**
   * Compute overall color statistics
   */
  static analyze(imageData) {
    const data = imageData.data;
    let warm = 0, cool = 0, neutral = 0;
    let totalSat = 0, totalLight = 0;
    let count = 0;

    const step = Math.max(4, Math.floor(data.length / 40000) * 4);

    for (let i = 0; i < data.length; i += step) {
      if (data[i + 3] < 128) continue;
      const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      const cat = colorTempCategory(hsl.h, hsl.s);
      if (cat === 'warm') warm++;
      else if (cat === 'cool') cool++;
      else neutral++;
      totalSat += hsl.s;
      totalLight += hsl.l;
      count++;
    }

    if (count === 0) return { warm: 0, cool: 0, neutral: 0, avgSaturation: 0, avgBrightness: 0, dominantTemp: '中性' };

    const total = warm + cool + neutral;
    return {
      warm: Math.round(warm / total * 100),
      cool: Math.round(cool / total * 100),
      neutral: Math.round(neutral / total * 100),
      avgSaturation: Math.round(totalSat / count),
      avgBrightness: Math.round(totalLight / count),
      dominantTemp: warm >= cool && warm >= neutral ? '暖色調' : cool >= warm && cool >= neutral ? '冷色調' : '中性色調'
    };
  }

  /**
   * Compute stats for a rectangular region using perceived brightness
   */
  static analyzeRegion(imageData, x, y, w, h) {
    const data = imageData.data;
    const imgW = imageData.width;
    const imgH = imageData.height;
    let totalSat = 0, totalBright = 0;
    let count = 0;

    const x1 = Math.max(0, Math.floor(x));
    const y1 = Math.max(0, Math.floor(y));
    const x2 = Math.min(imgW, Math.floor(x + w));
    const y2 = Math.min(imgH, Math.floor(y + h));

    if (x1 >= x2 || y1 >= y2) return { avgSaturation: 0, avgBrightness: 0, satLabel: '無資料', brightLabel: '無資料' };

    for (let py = y1; py < y2; py += 2) {
      for (let px = x1; px < x2; px += 2) {
        const i = (py * imgW + px) * 4;
        if (i + 3 >= data.length) continue;
        if (data[i + 3] < 128) continue;

        const r = data[i], g = data[i + 1], b = data[i + 2];
        const hsl = rgbToHsl(r, g, b);
        totalSat += hsl.s;

        // Use perceived brightness (0-255 → 0-100)
        const percBright = (0.299 * r + 0.587 * g + 0.114 * b) / 2.55;
        totalBright += percBright;
        count++;
      }
    }

    if (count === 0) return { avgSaturation: 0, avgBrightness: 0, satLabel: '無資料', brightLabel: '無資料' };

    const avgSat = Math.round(totalSat / count);
    const avgBright = Math.round(totalBright / count);

    return {
      avgSaturation: avgSat,
      avgBrightness: avgBright,
      satLabel: avgSat < 20 ? '極低飽和' : avgSat < 40 ? '低飽和' : avgSat < 60 ? '中飽和' : '高飽和',
      brightLabel: avgBright < 25 ? '暗部' : avgBright < 45 ? '中暗' : avgBright < 60 ? '中間調' : avgBright < 75 ? '中亮' : '亮部'
    };
  }
}
