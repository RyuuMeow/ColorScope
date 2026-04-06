/**
 * ColorPathTool — Draw a line, sample colors along it, and visualize
 * the trajectory on an HSL color wheel.
 */
import { bus } from '../utils/EventBus.js';
import { $, createElement } from '../utils/DOMUtils.js';
import { rgbToHsl, rgbToHex, perceivedBrightness } from '../core/ColorMath.js';

export class ColorPathTool {
  constructor(imageLoader, canvasEngine) {
    this.imageLoader = imageLoader;
    this.engine = canvasEngine;
    this._isDrawing = false;
    this._start = null;
    this._end = null;
    this._samples = null;
    this._panel = null;
    this._setup();
  }

  _setup() {
    const container = $('#canvas-container');

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || bus._currentTool !== 'colorpath') return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      if (!this.imageLoader.getPixel(imgX, imgY)) return;

      this._isDrawing = true;
      this._start = { imgX, imgY };
      this._end = null;
      this._samples = null;
      this._removePanel();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._isDrawing || bus._currentTool !== 'colorpath') return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      this._end = { imgX, imgY };
      this.engine.render();
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this._isDrawing) return;
      this._isDrawing = false;
      if (this._start && this._end) {
        const dist = Math.hypot(this._end.imgX - this._start.imgX, this._end.imgY - this._start.imgY);
        if (dist > 5) {
          this._sampleColors();
          this._showPathPanel();
        }
      }
      this.engine.render();
    });

    bus.on('canvas:render', (rd) => this._render(rd));
    bus.on('tool:changed', ({ tool }) => { if (tool !== 'colorpath') this._removePanel(); });
    bus.on('image:loaded', () => { this._samples = null; this._removePanel(); });
  }

  _sampleColors() {
    if (!this._start || !this._end) return;
    const N = 60;
    const dx = this._end.imgX - this._start.imgX;
    const dy = this._end.imgY - this._start.imgY;
    this._samples = [];

    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = this._start.imgX + dx * t;
      const y = this._start.imgY + dy * t;
      const pixel = this.imageLoader.getPixel(x, y);
      if (pixel) {
        const hsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
        this._samples.push({
          t, x, y,
          hex: rgbToHex(pixel.r, pixel.g, pixel.b),
          hsl,
          brightness: perceivedBrightness(pixel.r, pixel.g, pixel.b)
        });
      }
    }
  }

  _showPathPanel() {
    this._removePanel();
    if (!this._samples || this._samples.length < 2) return;

    const container = $('#canvas-container');
    const panel = document.createElement('div');
    panel.className = 'colorpath-panel';

    // Position near midpoint
    const mid = this._samples[Math.floor(this._samples.length / 2)];
    const { sx, sy } = this.engine.imageToScreen(mid.x, mid.y);
    panel.style.cssText = `position:absolute; z-index:55; left:${sx + 20}px; top:${sy - 100}px;`;

    // Header
    const header = createElement('div', { className: 'colorpath-header' }, [
      createElement('span', { textContent: '色版軌跡' }),
      createElement('button', { className: 'colorpath-close', textContent: '×', onClick: () => this._removePanel() })
    ]);

    // HSL color wheel canvas
    const wheelCanvas = document.createElement('canvas');
    wheelCanvas.className = 'colorpath-wheel';
    wheelCanvas.width = 240;
    wheelCanvas.height = 240;
    this._drawColorWheel(wheelCanvas);

    // Brightness/saturation curve below
    const curvesCanvas = document.createElement('canvas');
    curvesCanvas.className = 'colorpath-curves';
    curvesCanvas.width = 240;
    curvesCanvas.height = 60;
    this._drawCurves(curvesCanvas);

    panel.appendChild(header);
    panel.appendChild(wheelCanvas);
    panel.appendChild(curvesCanvas);
    container.appendChild(panel);
    this._panel = panel;

    // Draggable
    this._makeDraggable(panel, header);
  }

  _drawColorWheel(canvas) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cx = size / 2, cy = size / 2;
    const radius = size / 2 - 20;

    // Draw hue wheel background
    for (let angle = 0; angle < 360; angle += 1) {
      const rad = (angle - 90) * Math.PI / 180;
      const rad2 = (angle - 89) * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, rad, rad2);
      ctx.closePath();
      ctx.fillStyle = `hsl(${angle}, 70%, 50%)`;
      ctx.fill();
    }

    // Center fade to white/gray
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, 'rgba(128,128,128,0.9)');
    grad.addColorStop(0.5, 'rgba(128,128,128,0.3)');
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw the trajectory path
    if (!this._samples || this._samples.length < 2) return;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < this._samples.length - 1; i++) {
      const s1 = this._samples[i], s2 = this._samples[i + 1];
      const p1 = this._hslToWheelPos(s1.hsl, cx, cy, radius);
      const p2 = this._hslToWheelPos(s2.hsl, cx, cy, radius);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = s1.hex;
      ctx.stroke();
    }

    // Draw numbered dots
    const step = Math.max(1, Math.floor(this._samples.length / 8));
    for (let i = 0; i < this._samples.length; i += step) {
      const s = this._samples[i];
      const pos = this._hslToWheelPos(s.hsl, cx, cy, radius);

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = s.hex;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Start marker (triangle)
    const startPos = this._hslToWheelPos(this._samples[0].hsl, cx, cy, radius);
    ctx.save();
    ctx.beginPath();
    ctx.arc(startPos.x, startPos.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = this._samples[0].hex;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('S', startPos.x, startPos.y + 3);
    ctx.restore();

    // End marker
    const endPos = this._hslToWheelPos(this._samples[this._samples.length - 1].hsl, cx, cy, radius);
    ctx.save();
    ctx.beginPath();
    ctx.arc(endPos.x, endPos.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = this._samples[this._samples.length - 1].hex;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('E', endPos.x, endPos.y + 3);
    ctx.restore();
  }

  _hslToWheelPos(hsl, cx, cy, radius) {
    const angle = (hsl.h - 90) * Math.PI / 180;
    const dist = (hsl.s / 100) * radius;
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
  }

  _drawCurves(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const samples = this._samples;
    if (!samples || samples.length < 2) return;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, w, h);

    // Brightness curve
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const x = (i / samples.length) * w;
      const y = h - (samples[i].brightness / 100) * (h - 6);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Saturation curve
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const x = (i / samples.length) * w;
      const y = h - (samples[i].hsl.s / 100) * (h - 6);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Labels
    ctx.font = '9px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText('明度', 4, 12);
    ctx.fillStyle = 'rgba(6,182,212,0.5)';
    ctx.fillText('飽和度', 40, 12);
  }

  _removePanel() {
    if (this._panel) { this._panel.remove(); this._panel = null; }
  }

  _makeDraggable(panel, handle) {
    let dragging = false, sx, sy, sl, st;
    handle.style.cursor = 'grab';
    handle.addEventListener('mousedown', (e) => {
      dragging = true; sx = e.clientX; sy = e.clientY;
      sl = parseInt(panel.style.left); st = parseInt(panel.style.top);
      handle.style.cursor = 'grabbing'; e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = (sl + e.clientX - sx) + 'px';
      panel.style.top = (st + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; handle.style.cursor = 'grab'; });
  }

  _render(renderData) {
    const start = this._isDrawing ? this._start : null;
    const end = this._isDrawing ? this._end : null;
    if (!start || !end) return;

    const { ctx, scale, offsetX, offsetY } = renderData;
    const sx1 = start.imgX * scale + offsetX;
    const sy1 = start.imgY * scale + offsetY;
    const sx2 = end.imgX * scale + offsetX;
    const sy2 = end.imgY * scale + offsetY;

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx1, sy1, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx2, sy2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
