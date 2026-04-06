/**
 * ComparisonTool — Draw comparison lines between two points.
 * Multiple comparisons persist on canvas. Endpoints movable via MoveTool.
 */
import { bus } from '../utils/EventBus.js';
import { $ } from '../utils/DOMUtils.js';
import { rgbToHsl, rgbToHsv, rgbToHex, perceivedBrightness, colorDelta } from '../core/ColorMath.js';
import { ComparisonObject } from '../core/CanvasObject.js';

export class ComparisonTool {
  constructor(imageLoader, canvasEngine, layerManager) {
    this.imageLoader = imageLoader;
    this.engine = canvasEngine;
    this.layers = layerManager;
    this._isDrawing = false;
    this._startData = null;
    this._currentEnd = null;
    this._setup();
  }

  _setup() {
    const container = $('#canvas-container');

    $('#btn-clear-comparisons')?.addEventListener('click', () => {
      for (const layer of this.layers.layers) {
        layer.objects = layer.objects.filter(o => o.type !== 'comparison');
      }
      this.engine.render();
      bus.emit('layers:objects-changed');
    });

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || bus._currentTool !== 'compare') return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      const pixel = this.imageLoader.getPixel(imgX, imgY);
      if (!pixel) return;

      const hsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
      const hsv = rgbToHsv(pixel.r, pixel.g, pixel.b);
      this._isDrawing = true;
      this._startData = {
        imgX, imgY,
        r: pixel.r, g: pixel.g, b: pixel.b,
        hex: rgbToHex(pixel.r, pixel.g, pixel.b),
        hsl, hsv,
        brightness: perceivedBrightness(pixel.r, pixel.g, pixel.b)
      };
      this._currentEnd = null;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._isDrawing || bus._currentTool !== 'compare') return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      this._currentEnd = { imgX, imgY };
      this.engine.render();
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this._isDrawing) return;
      this._isDrawing = false;
      if (!this._startData || !this._currentEnd) return;

      const dist = Math.hypot(this._currentEnd.imgX - this._startData.imgX, this._currentEnd.imgY - this._startData.imgY);
      if (dist < 5) { this._currentEnd = null; return; }

      const pixel = this.imageLoader.getPixel(this._currentEnd.imgX, this._currentEnd.imgY);
      if (!pixel) return;

      const endHsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
      const endHsv = rgbToHsv(pixel.r, pixel.g, pixel.b);
      const endData = {
        imgX: this._currentEnd.imgX, imgY: this._currentEnd.imgY,
        r: pixel.r, g: pixel.g, b: pixel.b,
        hex: rgbToHex(pixel.r, pixel.g, pixel.b),
        hsl: endHsl, hsv: endHsv,
        brightness: perceivedBrightness(pixel.r, pixel.g, pixel.b)
      };

      const comp = new ComparisonObject(this._startData, endData);
      comp.delta = colorDelta(this._startData.hsl, endHsl);
      comp.dBright = Math.abs(this._startData.brightness - endData.brightness);

      this.layers.addObject(comp);
      this._currentEnd = null;
      this.engine.render();
      bus.emit('layers:objects-changed');

      // Emit for side panel
      bus.emit('compare:result-line', { start: this._startData, end: endData, delta: comp.delta, dBright: comp.dBright });
    });

    // Render preview line while drawing
    bus.on('canvas:render', (rd) => this._renderPreview(rd));
  }

  _renderPreview(renderData) {
    if (!this._isDrawing || !this._startData || !this._currentEnd) return;
    const { ctx, scale, offsetX, offsetY } = renderData;
    const sx1 = this._startData.imgX * scale + offsetX;
    const sy1 = this._startData.imgY * scale + offsetY;
    const sx2 = this._currentEnd.imgX * scale + offsetX;
    const sy2 = this._currentEnd.imgY * scale + offsetY;

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Endpoints
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx1, sy1, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx2, sy2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
