/**
 * BrushTool - Basic round brush + eraser with optional pen pressure.
 */
import { bus } from '../utils/EventBus.js';
import { $ } from '../utils/DOMUtils.js';
import { BrushStrokeObject } from '../core/CanvasObject.js';

export class BrushTool {
  constructor(canvasEngine, layerManager, getSettings) {
    this.engine = canvasEngine;
    this.layers = layerManager;
    this.getSettings = getSettings;
    this._drawing = null;
    this._hoverPoint = null;
    this._renderQueued = false;
    this._setup();
  }

  _setup() {
    const container = $('#canvas-container');
    if (!container) return;

    const handleStrokeMove = (e) => {
      if (!this._drawing) return;
      if (e.pointerId !== this._drawing.pointerId) return;
      if (e.cancelable) e.preventDefault();

      const pressure = this._resolvePressure(e);
      if (
        this._drawing.lastClientX === e.clientX &&
        this._drawing.lastClientY === e.clientY &&
        this._drawing.lastPressure === pressure
      ) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      this._drawing.stroke.addPoint(imgX, imgY, pressure);
      const fallbackPreviewSize = this.getSettings?.(this._drawing.stroke.mode === 'erase' ? 'eraser' : 'brush')?.size || 1;
      this._drawing.previewSize = this._drawing.stroke.points[this._drawing.stroke.points.length - 1]?.size || fallbackPreviewSize;
      this._drawing.lastClientX = e.clientX;
      this._drawing.lastClientY = e.clientY;
      this._drawing.lastPressure = pressure;
      this._hoverPoint = { imgX, imgY, size: this._drawing.previewSize };
      if (this.engine?._lastFilterPayload) {
        bus.emit('layers:preview-changed');
        return;
      }
      this._scheduleRender();
    };

    container.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (bus._currentTool !== 'brush' && bus._currentTool !== 'eraser') return;
      if (this.engine.isPanning || this.engine._rightBtnDown) return;
      if (this._drawing) return;

      if (e.cancelable) e.preventDefault();

      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      const settings = this.getSettings?.(bus._currentTool);
      if (!settings) return;

      const stroke = new BrushStrokeObject({
        mode: bus._currentTool === 'eraser' ? 'erase' : 'paint',
        color: settings.color,
        size: settings.size,
        opacity: settings.opacity / 100,
        flow: settings.flow / 100,
        hardness: settings.hardness / 100,
        pressureSize: settings.pressureSize,
        pressureOpacity: settings.pressureOpacity
      });
      stroke.addPoint(imgX, imgY, this._resolvePressure(e));

      this.layers.deselectAll();
      this.layers.addObject(stroke);
      this._drawing = {
        pointerId: e.pointerId,
        stroke,
        previewSize: stroke.points[stroke.points.length - 1]?.size || settings.size,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        lastPressure: this._resolvePressure(e),
        captureElement: e.target instanceof Element ? e.target : container
      };
      this._hoverPoint = { imgX, imgY, size: this._drawing.previewSize };
      try {
        this._drawing.captureElement?.setPointerCapture?.(e.pointerId);
      } catch {}
      this._scheduleRender();
    });

    container.addEventListener('pointermove', (e) => {
      if (this._drawing) return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      const activeTool = bus._currentTool;
      const settings = this.getSettings?.(activeTool === 'eraser' ? 'eraser' : 'brush');
      const previewSize = settings?.size || 1;
      if (activeTool === 'brush' || activeTool === 'eraser') {
        this._hoverPoint = { imgX, imgY, size: previewSize };
      } else {
        this._hoverPoint = null;
      }
      this._scheduleRender();
    });

    window.addEventListener('pointermove', handleStrokeMove);
    window.addEventListener('pointerrawupdate', handleStrokeMove);

    const finishStroke = (e) => {
      if (!this._drawing) return;
      if (e.pointerId !== undefined && e.pointerId !== this._drawing.pointerId) return;
      const { stroke, captureElement, pointerId } = this._drawing;
      try {
        captureElement?.releasePointerCapture?.(pointerId);
      } catch {}
      this._drawing = null;
      if (stroke.points.length < 2) {
        const p = stroke.points[0];
        if (p) stroke.addPoint(p.x + 0.01, p.y + 0.01, 1);
      }
      if (this._hoverPoint) {
        this._hoverPoint.size = stroke.points[stroke.points.length - 1]?.size || this._hoverPoint.size;
      }
      bus.emit('layers:objects-changed');
      this._scheduleRender();
    };

    window.addEventListener('pointerup', finishStroke);
    window.addEventListener('pointercancel', finishStroke);
    window.addEventListener('blur', () => finishStroke({ pointerId: this._drawing?.pointerId }));
    container.addEventListener('pointerleave', () => {
      this._hoverPoint = null;
      if (!this._drawing) this._scheduleRender();
    });

    bus.on('tool:changed', ({ tool }) => {
      if (tool !== 'brush' && tool !== 'eraser') {
        this._hoverPoint = null;
        this._scheduleRender();
      }
    });

    bus.on('canvas:render', (renderData) => this._renderPreview(renderData));
  }

  _resolvePressure(event) {
    if (event.pointerType === 'pen') {
      return Math.max(0.05, Math.min(1, event.pressure || 0.5));
    }
    return 1;
  }

  _renderPreview({ ctx, scale, offsetX, offsetY }) {
    if (!this._hoverPoint) return;
    if (bus._currentTool !== 'brush' && bus._currentTool !== 'eraser') return;
    const radius = Math.max(1, (this._hoverPoint.size * scale) / 2);
    const sx = this._hoverPoint.imgX * scale + offsetX;
    const sy = this._hoverPoint.imgY * scale + offsetY;

    ctx.save();
    ctx.strokeStyle = bus._currentTool === 'eraser' ? 'rgba(244, 114, 182, 0.95)' : 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash(bus._currentTool === 'eraser' ? [5, 4] : []);
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(sx, sy, radius + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _scheduleRender() {
    if (this._renderQueued) return;
    this._renderQueued = true;
    requestAnimationFrame(() => {
      this._renderQueued = false;
      this.engine.render();
    });
  }
}
