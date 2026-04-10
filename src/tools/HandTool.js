/**
 * HandTool — Left-click drag to pan the canvas (same as right-click pan, on left button)
 */
import { bus } from '../utils/EventBus.js';
import { $ } from '../utils/DOMUtils.js';

export class HandTool {
  constructor(canvasEngine) {
    this.engine = canvasEngine;
    this._isPanning = false;
    this._pointerId = null;
    this._startX = 0;
    this._startY = 0;
    this._origOffX = 0;
    this._origOffY = 0;
    this._setup();
  }

  _setup() {
    const container = $('#canvas-container');

    container.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || bus._currentTool !== 'hand') return;
      this._isPanning = true;
      this._pointerId = e.pointerId;
      this._startX = e.clientX;
      this._startY = e.clientY;
      this._origOffX = this.engine.offsetX;
      this._origOffY = this.engine.offsetY;
      container.style.cursor = 'grabbing';
      if (e.cancelable) e.preventDefault();
      try {
        (e.target instanceof Element ? e.target : container).setPointerCapture?.(e.pointerId);
      } catch {}
    });

    window.addEventListener('pointermove', (e) => {
      if (!this._isPanning) return;
      if (this._pointerId !== null && e.pointerId !== this._pointerId) return;
      this.engine.offsetX = this._origOffX + (e.clientX - this._startX);
      this.engine.offsetY = this._origOffY + (e.clientY - this._startY);
      this.engine.render();
      bus.emit('canvas:transformed');
    });

    const stopPan = (e = {}) => {
      if (!this._isPanning) return;
      if (this._pointerId !== null && e.pointerId !== undefined && e.pointerId !== this._pointerId) return;
      this._isPanning = false;
      this._pointerId = null;
      container.style.cursor = '';
    };

    window.addEventListener('pointerup', stopPan);
    window.addEventListener('pointercancel', stopPan);
    window.addEventListener('blur', () => stopPan({ pointerId: this._pointerId }));
  }
}
