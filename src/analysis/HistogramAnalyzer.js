/**
 * HistogramAnalyzer — Generates brightness & saturation histograms
 */
import { rgbToHsl } from '../core/ColorMath.js';

export class HistogramAnalyzer {
  /**
   * Compute brightness histogram (256 bins)
   */
  static brightnessHistogram(imageData) {
    const bins = new Uint32Array(256);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const brightness = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      bins[brightness]++;
    }
    return bins;
  }

  /**
   * Compute saturation histogram (101 bins, 0-100%)
   */
  static saturationHistogram(imageData) {
    const bins = new Uint32Array(101);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel for perf
      if (data[i + 3] < 128) continue;
      const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      bins[hsl.s]++;
    }
    return bins;
  }

  /**
   * Compute hue histogram (361 bins, 0-360°)
   */
  static hueHistogram(imageData) {
    const bins = new Uint32Array(361);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i + 3] < 128) continue;
      const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (hsl.s > 5) bins[hsl.h]++; // Ignore near-gray
    }
    return bins;
  }

  /**
   * Draw a histogram onto a canvas element
   */
  static drawHistogram(canvasEl, bins, color = '#6366f1', bgColor = 'transparent') {
    const ctx = canvasEl.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvasEl.getBoundingClientRect();
    // Use rect dims if available, otherwise fallback to reasonable defaults
    const w = rect.width > 0 ? rect.width : (canvasEl.parentElement?.offsetWidth || 280);
    const h = rect.height > 0 ? rect.height : 100;
    canvasEl.width = w * dpr;
    canvasEl.height = h * dpr;
    canvasEl.style.width = w + 'px';
    canvasEl.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    // Find max for normalization
    let max = 0;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] > max) max = bins[i];
    }
    if (max === 0) return;

    const barWidth = w / bins.length;

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    if (color === 'hue') {
      // Special: draw each bar with its hue color
      for (let i = 0; i < bins.length; i++) {
        const barHeight = (bins[i] / max) * (h - 4);
        const x = i * barWidth;
        ctx.fillStyle = `hsl(${i}, 70%, 55%)`;
        ctx.fillRect(x, h - barHeight, Math.max(barWidth, 1), barHeight);
      }
      return;
    }

    gradient.addColorStop(0, color + 'dd');
    gradient.addColorStop(1, color + '33');

    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let i = 0; i < bins.length; i++) {
      const barHeight = (bins[i] / max) * (h - 4);
      const x = i * barWidth;
      ctx.lineTo(x, h - barHeight);
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Top line
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < bins.length; i++) {
      const barHeight = (bins[i] / max) * (h - 4);
      ctx.lineTo(i * barWidth, h - barHeight);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
