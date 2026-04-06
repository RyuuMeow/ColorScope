/**
 * PaletteExtractor — K-Means based dominant color extraction
 */
import { rgbToHsl, rgbToHex } from '../core/ColorMath.js';

export class PaletteExtractor {
  /**
   * Extract dominant colors from ImageData
   * @param {ImageData} imageData
   * @param {number} k - number of clusters (default 6)
   * @returns {Array<{r, g, b, hex, hsl, count, percentage}>}
   */
  static extract(imageData, k = 6) {
    const pixels = PaletteExtractor._samplePixels(imageData, 10000);
    if (pixels.length === 0) return [];

    // Initialize centroids using k-means++
    let centroids = PaletteExtractor._initCentroids(pixels, k);
    let assignments = new Array(pixels.length);

    // K-means iterations
    for (let iter = 0; iter < 20; iter++) {
      // Assign pixels to nearest centroid
      let changed = false;
      for (let i = 0; i < pixels.length; i++) {
        let minDist = Infinity;
        let minIdx = 0;
        for (let j = 0; j < centroids.length; j++) {
          const dist = PaletteExtractor._colorDist(pixels[i], centroids[j]);
          if (dist < minDist) { minDist = dist; minIdx = j; }
        }
        if (assignments[i] !== minIdx) { assignments[i] = minIdx; changed = true; }
      }

      if (!changed) break;

      // Recalculate centroids
      const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
      for (let i = 0; i < pixels.length; i++) {
        const c = assignments[i];
        sums[c].r += pixels[i][0];
        sums[c].g += pixels[i][1];
        sums[c].b += pixels[i][2];
        sums[c].count++;
      }

      centroids = sums.map((s, i) => {
        if (s.count === 0) return centroids[i];
        return [Math.round(s.r / s.count), Math.round(s.g / s.count), Math.round(s.b / s.count)];
      });
    }

    // Count final assignments
    const counts = new Array(k).fill(0);
    for (const a of assignments) counts[a]++;
    const total = pixels.length;

    // Build result
    const result = centroids.map((c, i) => ({
      r: c[0], g: c[1], b: c[2],
      hex: rgbToHex(c[0], c[1], c[2]),
      hsl: rgbToHsl(c[0], c[1], c[2]),
      count: counts[i],
      percentage: Math.round(counts[i] / total * 100)
    }));

    // Sort by percentage (descending)
    result.sort((a, b) => b.percentage - a.percentage);

    // Remove empty clusters
    return result.filter(c => c.percentage > 0);
  }

  /**
   * Sample pixels from image data (for performance)
   */
  static _samplePixels(imageData, maxSamples) {
    const data = imageData.data;
    const totalPixels = data.length / 4;
    const step = Math.max(1, Math.floor(totalPixels / maxSamples));
    const pixels = [];

    for (let i = 0; i < data.length; i += step * 4) {
      const a = data[i + 3];
      if (a < 128) continue; // Skip transparent
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }

    return pixels;
  }

  /**
   * K-means++ initialization
   */
  static _initCentroids(pixels, k) {
    const centroids = [];
    // Pick first centroid randomly
    centroids.push([...pixels[Math.floor(Math.random() * pixels.length)]]);

    for (let i = 1; i < k; i++) {
      // Calculate distances to nearest centroid
      const dists = pixels.map(p => {
        let minD = Infinity;
        for (const c of centroids) {
          const d = PaletteExtractor._colorDist(p, c);
          if (d < minD) minD = d;
        }
        return minD;
      });

      // Weighted random selection
      const totalDist = dists.reduce((s, d) => s + d, 0);
      let r = Math.random() * totalDist;
      for (let j = 0; j < dists.length; j++) {
        r -= dists[j];
        if (r <= 0) {
          centroids.push([...pixels[j]]);
          break;
        }
      }
    }

    return centroids;
  }

  static _colorDist(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }
}
