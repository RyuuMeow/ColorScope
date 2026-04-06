/**
 * RegionTool — Draw rectangular regions for color analysis.
 * Regions persist on canvas. Movable/resizable via MoveTool.
 */
import { bus } from '../utils/EventBus.js';
import { $ } from '../utils/DOMUtils.js';
import { ColorStats } from '../analysis/ColorStats.js';
import { RegionObject } from '../core/CanvasObject.js';

export class RegionTool {
  constructor(imageLoader, canvasEngine, layerManager) {
    this.imageLoader = imageLoader;
    this.engine = canvasEngine;
    this.layers = layerManager;
    this._isDrawing = false;
    this._startX = 0;
    this._startY = 0;
    this._currentRect = null;
    this._setup();
  }

  _setup() {
    const container = $('#canvas-container');

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || bus._currentTool !== 'region') return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      this._isDrawing = true;
      this._startX = imgX;
      this._startY = imgY;
      this._currentRect = null;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._isDrawing) return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      this._currentRect = {
        x: Math.min(this._startX, imgX),
        y: Math.min(this._startY, imgY),
        w: Math.abs(imgX - this._startX),
        h: Math.abs(imgY - this._startY)
      };
      this.engine.render();
    });

    window.addEventListener('mouseup', () => {
      if (!this._isDrawing) return;
      this._isDrawing = false;
      if (!this._currentRect || this._currentRect.w < 5 || this._currentRect.h < 5) {
        this._currentRect = null;
        return;
      }

      const stats = ColorStats.analyzeRegion(
        this.imageLoader.imageData,
        this._currentRect.x, this._currentRect.y,
        this._currentRect.w, this._currentRect.h
      );

      const region = new RegionObject(this._currentRect.x, this._currentRect.y, this._currentRect.w, this._currentRect.h, stats);
      this.layers.addObject(region);
      this._currentRect = null;
      this.engine.render();
      bus.emit('layers:objects-changed');
    });

    // Touch
    container.addEventListener('touchstart', (e) => {
      if (bus._currentTool !== 'region' || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(touch.clientX - rect.left, touch.clientY - rect.top);
      this._isDrawing = true;
      this._startX = imgX;
      this._startY = imgY;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!this._isDrawing || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(touch.clientX - rect.left, touch.clientY - rect.top);
      this._currentRect = {
        x: Math.min(this._startX, imgX), y: Math.min(this._startY, imgY),
        w: Math.abs(imgX - this._startX), h: Math.abs(imgY - this._startY)
      };
      this.engine.render();
    }, { passive: true });

    container.addEventListener('touchend', () => {
      if (!this._isDrawing) return;
      this._isDrawing = false;
      if (this._currentRect && this._currentRect.w >= 5 && this._currentRect.h >= 5) {
        const stats = ColorStats.analyzeRegion(
          this.imageLoader.imageData,
          this._currentRect.x, this._currentRect.y, this._currentRect.w, this._currentRect.h
        );
        this.layers.addObject(new RegionObject(this._currentRect.x, this._currentRect.y, this._currentRect.w, this._currentRect.h, stats));
        this.engine.render();
        bus.emit('layers:objects-changed');
      }
      this._currentRect = null;
    });

    // Render preview rect
    bus.on('canvas:render', (rd) => this._renderPreview(rd));
  }

  _renderPreview(renderData) {
    if (!this._currentRect || !this._isDrawing) return;
    const { ctx, scale, offsetX, offsetY } = renderData;
    const x = this._currentRect.x * scale + offsetX;
    const y = this._currentRect.y * scale + offsetY;
    const w = this._currentRect.w * scale;
    const h = this._currentRect.h * scale;

    ctx.save();
    ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
}
