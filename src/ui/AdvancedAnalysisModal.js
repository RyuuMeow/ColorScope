import { createElement } from '../utils/DOMUtils.js';
import { PaletteExtractor } from '../analysis/PaletteExtractor.js';
import { HistogramAnalyzer } from '../analysis/HistogramAnalyzer.js';
import { ColorStats } from '../analysis/ColorStats.js';
import { rgbToHsl, rgbToHsv, perceivedBrightness, brightnessLabel } from '../core/ColorMath.js';
import { colorDetailsModal } from './ColorDetailsModal.js';

export class AdvancedAnalysisModal {
  constructor() {
    this.modal = null;
  }

  show(imageLoader) {
    this.close();
    if (!imageLoader || !imageLoader.imageData) return;

    const imageData = imageLoader.imageData;
    
    // Create Backdrop
    this.modal = createElement('div', {
      className: 'modal-backdrop',
      style: {
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, animation: 'fadeIn 0.25s ease-out',
        padding: '2rem'
      },
      onClick: (e) => { if (e.target === this.modal) this.close(); }
    });

    const panel = createElement('div', {
      className: 'modal-panel',
      style: {
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)',
        display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '1100px',
        maxHeight: '100%', overflow: 'hidden', animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }
    });

    // Header
    const header = createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }
    });
    header.appendChild(createElement('h2', { textContent: '色彩深度分析', style: { margin: 0, fontSize: '20px', color: 'var(--text-primary)' }}));
    header.appendChild(createElement('div', {
      innerHTML: '&times;', style: { fontSize: '28px', color: 'var(--text-tertiary)', cursor: 'pointer', lineHeight: '20px' },
      onClick: () => this.close()
    }));
    panel.appendChild(header);

    // Body container: 2 columns
    const body = createElement('div', {
      style: { display: 'flex', flex: 1, overflow: 'auto', padding: '24px', gap: '24px' }
    });
    
    // Left Column: Original image + Stats overview + Palette
    const leftCol = createElement('div', { style: { flex: '0 0 350px', display: 'flex', flexDirection: 'column', gap: '24px' }});
    
    // 1. Image preview
    const imgPreview = createElement('div', {
      style: { 
        width: '100%', height: '240px', background: `url(${imageLoader.image.src}) center/contain no-repeat`,
        borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)'
      }
    });
    leftCol.appendChild(imgPreview);

    // Run Stats
    const stats = ColorStats.analyze(imageData);
    const palette = PaletteExtractor.extract(imageData, 8);

    // 2. High-level Overview
    const overview = createElement('div', {
      style: { background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px'}
    });
    const ovTitle = createElement('h3', { textContent: '整體色彩基調', style: { margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }});
    overview.appendChild(ovTitle);
    
    const statsGrid = createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }});
    const addStat = (label, val) => {
      const item = createElement('div');
      item.appendChild(createElement('div', { textContent: label, style: { fontSize: '12px', color: 'var(--text-tertiary)' }}));
      item.appendChild(createElement('div', { textContent: val, style: { fontSize: '15px', color: 'var(--text-primary)', fontWeight: 'bold' }}));
      statsGrid.appendChild(item);
    };
    addStat('主導色溫', stats.dominantTemp);
    addStat('平均飽和度', `${stats.avgSaturation}%`);
    addStat('平均明度', `${stats.avgBrightness}%`);
    overview.appendChild(statsGrid);

    // Color Temp Bar
    const tempBar = createElement('div', { style: { width: '100%', height: '12px', borderRadius: '6px', display: 'flex', overflow: 'hidden', marginTop: '8px' }});
    if (stats.warm > 0) tempBar.appendChild(createElement('div', { style: { width: `${stats.warm}%`, background: '#f97316' }, title: `暖色 ${stats.warm}%` }));
    if (stats.neutral > 0) tempBar.appendChild(createElement('div', { style: { width: `${stats.neutral}%`, background: '#9ca3af' }, title: `中性 ${stats.neutral}%` }));
    if (stats.cool > 0) tempBar.appendChild(createElement('div', { style: { width: `${stats.cool}%`, background: '#3b82f6' }, title: `冷色 ${stats.cool}%` }));
    const tempLabels = createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }});
    tempLabels.appendChild(createElement('span', { textContent: `暖 ${stats.warm}%`}));
    tempLabels.appendChild(createElement('span', { textContent: `冷 ${stats.cool}%`}));
    overview.appendChild(tempBar);
    overview.appendChild(tempLabels);
    
    leftCol.appendChild(overview);

    // 3. Dominant Palette Proportions
    const palContainer = createElement('div', { style: { background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '16px' }});
    palContainer.appendChild(createElement('h3', { textContent: '主要色彩比例', style: { margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)' }}));
    
    const palList = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' }});
    palette.forEach(p => {
      const row = createElement('div', { 
        style: { display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' },
        onClick: () => {
          const hsv = rgbToHsv(p.r, p.g, p.b);
          const b = perceivedBrightness(p.r, p.g, p.b);
          const detailData = {
            r: p.r, g: p.g, b: p.b, hex: p.hex,
            hsl: p.hsl, hsv, brightness: b, brightLabel: brightnessLabel(b),
            imgX: 0, imgY: 0
          };
          colorDetailsModal.show(detailData);
        }
      });
      const dot = createElement('div', { style: { width: '20px', height: '20px', borderRadius: '50%', background: p.hex }});
      const bBar = createElement('div', { style: { flex: 1, height: '8px', background: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }});
      bBar.appendChild(createElement('div', { style: { width: `${p.percentage}%`, height: '100%', background: p.hex }}));
      const lbl = createElement('div', { textContent: `${p.percentage}%`, style: { width: '30px', fontSize: '12px', textAlign: 'right', color: 'var(--text-secondary)' }});
      row.appendChild(dot); row.appendChild(bBar); row.appendChild(lbl);
      palList.appendChild(row);
    });
    palContainer.appendChild(palList);
    leftCol.appendChild(palContainer);

    // Right Column: Histograms
    const rightCol = createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }});
    
    const createChartBlock = (title, analysisFunc, color, binsLabel) => {
      const wrapper = createElement('div', { style: { background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '16px' }});
      const t = createElement('h3', { textContent: title, style: { margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)' }});
      wrapper.appendChild(t);
      const canvas = createElement('canvas', { style: { width: '100%', height: '140px' }});
      wrapper.appendChild(canvas);
      
      const lblLine = createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' }});
      lblLine.appendChild(createElement('span', { textContent: binsLabel[0] }));
      lblLine.appendChild(createElement('span', { textContent: binsLabel[1] }));
      wrapper.appendChild(lblLine);

      // Render chart
      setTimeout(() => {
        const bins = analysisFunc(imageData);
        HistogramAnalyzer.drawHistogram(canvas, bins, color);
      }, 50);

      return wrapper;
    };

    // 2D HSV Scatter Wheel
    const scatterWrapper = createElement('div', { style: { background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '16px' }});
    scatterWrapper.appendChild(createElement('h3', { textContent: 'HSL 色環分佈 (Hue/Saturation Scatter)', style: { margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)' }}));
    const wheelCanvas = createElement('canvas', { style: { width: '100%', height: '240px' }});
    scatterWrapper.appendChild(wheelCanvas);
    
    setTimeout(() => {
      const ctx = wheelCanvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const w = wheelCanvas.parentElement.offsetWidth - 32;
      const h = 240;
      wheelCanvas.width = w * dpr;
      wheelCanvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      
      const cx = w / 2;
      const cy = h / 2;
      const rMax = Math.min(cx, cy) - 10;
      
      // Draw background wheel
      for (let angle = 0; angle < 360; angle += 1) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + rMax * Math.cos(angle * Math.PI / 180), cy + rMax * Math.sin(angle * Math.PI / 180));
        ctx.strokeStyle = `hsl(${angle}, 100%, 50%)`;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
      
      // Plot points
      const pixels = PaletteExtractor._samplePixels(imageData, 10000);
      pixels.forEach(p => {
        const c = rgbToHsl(p[0], p[1], p[2]);
        const r = (c.s / 100) * rMax;
        const x = cx + r * Math.cos(c.h * Math.PI / 180);
        const y = cy + r * Math.sin(c.h * Math.PI / 180);
        ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      });
      
      // Rings
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      [0.33, 0.66, 1].forEach(f => {
        ctx.beginPath(); ctx.arc(cx, cy, rMax * f, 0, Math.PI * 2); ctx.stroke();
      });
    }, 50);

    rightCol.appendChild(scatterWrapper);
    rightCol.appendChild(createChartBlock('飽和度分佈 (Saturation)', HistogramAnalyzer.saturationHistogram, '#8b5cf6', ['0 (灰)', '100 (全飽和)']));
    rightCol.appendChild(createChartBlock('明度分佈 (Brightness)', HistogramAnalyzer.brightnessHistogram, '#10b981', ['0 (黑)', '255 (白)']));

    body.appendChild(leftCol);
    body.appendChild(rightCol);
    panel.appendChild(body);
    this.modal.appendChild(panel);
    document.body.appendChild(this.modal);
  }

  close() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }
}

export const advancedAnalysisModal = new AdvancedAnalysisModal();
