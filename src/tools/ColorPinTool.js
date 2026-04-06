/**
 * ColorPinTool — Only handles CREATING pins (click to place).
 * Moving/editing is handled by MoveTool. Objects stored in LayerManager.
 */
import { bus } from '../utils/EventBus.js';
import { $ } from '../utils/DOMUtils.js';
import { rgbToHsl, rgbToHsv, rgbToHex, perceivedBrightness, colorTemperature, saturationLabel, brightnessLabel } from '../core/ColorMath.js';
import { PinObject } from '../core/CanvasObject.js';

export class ColorPinTool {
  constructor(imageLoader, canvasEngine, layerManager) {
    this.imageLoader = imageLoader;
    this.engine = canvasEngine;
    this.layers = layerManager;
    this._mouseDownPos = null;
    this._setup();
  }

  _setup() {
    const container = $('#canvas-container');

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || bus._currentTool !== 'pin') return;
      this._mouseDownPos = { clientX: e.clientX, clientY: e.clientY };
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || bus._currentTool !== 'pin' || !this._mouseDownPos) return;
      const dx = Math.abs(e.clientX - this._mouseDownPos.clientX);
      const dy = Math.abs(e.clientY - this._mouseDownPos.clientY);
      this._mouseDownPos = null;

      // Only place pin on click (not drag)
      if (dx > 5 || dy > 5 || this.engine.isPanning) return;

      const rect = container.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { imgX, imgY } = this.engine.screenToImage(sx, sy);

      // If clicking on existing object, select it instead of creating new
      const hit = this.layers.getObjectAt(imgX, imgY, this.engine.scale);
      if (hit) {
        this.layers.deselectAll();
        hit.selected = true;
        this.engine.render();
        return;
      }

      const pixel = this.imageLoader.getPixel(imgX, imgY);
      if (!pixel) return;
      this.addPin(imgX, imgY, pixel);
    });

    // Touch
    container.addEventListener('touchend', (e) => {
      if (bus._currentTool !== 'pin' || e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(touch.clientX - rect.left, touch.clientY - rect.top);
      const pixel = this.imageLoader.getPixel(imgX, imgY);
      if (pixel) this.addPin(imgX, imgY, pixel);
    });

    // Clear button
    $('#btn-clear-pins')?.addEventListener('click', () => {
      for (const layer of this.layers.layers) {
        layer.objects = layer.objects.filter(o => o.type !== 'pin');
      }
      this.engine.render();
      bus.emit('layers:objects-changed');
    });

    // Context menu handlers
    bus.on('contextmenu:action', ({ action, data }) => {
      if (action === 'delete-pin') this.layers.removeObject(data.pinId);
      else if (action === 'copy-color') {
        const pin = this.layers.getActiveObjects().find(o => o.id === data.pinId);
        if (pin) navigator.clipboard?.writeText(pin.hex);
      }
    });
  }

  addPin(imgX, imgY, pixel) {
    const hsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
    const hsv = rgbToHsv(pixel.r, pixel.g, pixel.b);
    const pin = new PinObject(imgX, imgY, {
      r: pixel.r, g: pixel.g, b: pixel.b,
      hex: rgbToHex(pixel.r, pixel.g, pixel.b),
      hsl, hsv,
      brightness: perceivedBrightness(pixel.r, pixel.g, pixel.b),
      temp: colorTemperature(hsl.h, hsl.s),
      satLabel: saturationLabel(hsl.s),
      brightLabel: brightnessLabel(hsl.l),
    });
    this.layers.addObject(pin);
    this.engine.render();
    bus.emit('layers:objects-changed');
    return pin;
  }

  // Compatibility helpers
  getPins() { return this.layers.getAllObjectsByType('pin'); }
}
