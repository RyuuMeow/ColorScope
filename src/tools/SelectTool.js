/**
 * SelectTool — Drag a rectangle to select multiple objects, Delete key to remove
 */
import { bus } from '../utils/EventBus.js';
import { $ } from '../utils/DOMUtils.js';

export class SelectTool {
  constructor(layerManager, canvasEngine) {
    this.layers = layerManager;
    this.engine = canvasEngine;
    this._isSelecting = false;
    this._startX = 0;
    this._startY = 0;
    this._rect = null;
    this._setup();
  }

  _setup() {
    const container = $('#canvas-container');

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || bus._currentTool !== 'select') return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);

      // Click on an object → toggle selection
      const obj = this.layers.getObjectAt(imgX, imgY, this.engine.scale);
      if (obj && !e.shiftKey) {
        this.layers.deselectAll();
        obj.selected = true;
        this.engine.render();
        return;
      }
      if (obj && e.shiftKey) {
        obj.selected = !obj.selected;
        this.engine.render();
        return;
      }

      // Start box selection
      if (!e.shiftKey) this.layers.deselectAll();
      this._isSelecting = true;
      this._startX = imgX;
      this._startY = imgY;
      this._rect = null;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._isSelecting) return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      this._rect = {
        x: Math.min(this._startX, imgX),
        y: Math.min(this._startY, imgY),
        w: Math.abs(imgX - this._startX),
        h: Math.abs(imgY - this._startY)
      };
      this.engine.render();
    });

    window.addEventListener('mouseup', (e) => {
      if (!this._isSelecting) return;
      this._isSelecting = false;
      if (this._rect && this._rect.w > 2 && this._rect.h > 2) {
        const hits = this.layers.getObjectsInRect(this._rect.x, this._rect.y, this._rect.w, this._rect.h);
        hits.forEach(o => o.selected = true);
      }
      this._rect = null;
      this.engine.render();
      bus.emit('selection:changed');
    });

    // Delete key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) return;
        const selected = this.layers.getSelectedObjects();
        if (selected.length > 0) {
          this.layers.deleteSelected();
          this.engine.render();
          bus.emit('layers:objects-changed');
        }
      }
    });

    bus.on('canvas:render', (rd) => this._render(rd));
  }

  _render(renderData) {
    if (!this._rect || !this._isSelecting) return;
    const { ctx, scale, offsetX, offsetY } = renderData;
    const x = this._rect.x * scale + offsetX;
    const y = this._rect.y * scale + offsetY;
    const w = this._rect.w * scale;
    const h = this._rect.h * scale;

    ctx.save();
    ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
    ctx.fillRect(x, y, w, h);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
}
