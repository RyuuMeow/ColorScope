/**
 * HandTool — Left-click drag to pan the canvas (same as right-click pan, on left button)
 */
import { bus } from '../utils/EventBus.js';
import { $ } from '../utils/DOMUtils.js';

export class HandTool {
  constructor(canvasEngine) {
    this.engine = canvasEngine;
    this._isPanning = false;
    this._startX = 0;
    this._startY = 0;
    this._origOffX = 0;
    this._origOffY = 0;
    this._setup();
  }

  _setup() {
    const container = $('#canvas-container');

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || bus._currentTool !== 'hand') return;
      this._isPanning = true;
      this._startX = e.clientX;
      this._startY = e.clientY;
      this._origOffX = this.engine.offsetX;
      this._origOffY = this.engine.offsetY;
      container.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._isPanning) return;
      this.engine.offsetX = this._origOffX + (e.clientX - this._startX);
      this.engine.offsetY = this._origOffY + (e.clientY - this._startY);
      this.engine.render();
      bus.emit('canvas:transformed');
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this._isPanning) return;
      this._isPanning = false;
      container.style.cursor = '';
    });
  }
}
