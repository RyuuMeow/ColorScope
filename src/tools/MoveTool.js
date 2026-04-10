/**
 * MoveTool — Universal move/edit tool
 * - Drag objects to move them
 * - Drag region handles to resize
 * - Drag comparison endpoints independently
 * - Double-click notes to edit
 * - Moves pins and resamples color
 */
import { bus } from '../utils/EventBus.js';
import { $, createElement } from '../utils/DOMUtils.js';
import { rgbToHsl, rgbToHsv, rgbToHex, perceivedBrightness, colorTemperature, saturationLabel, brightnessLabel } from '../core/ColorMath.js';
import { ColorStats } from '../analysis/ColorStats.js';
import { colorDetailsModal } from '../ui/ColorDetailsModal.js';
import { comparisonDetailsModal } from '../ui/ComparisonDetailsModal.js';

export class MoveTool {
  constructor(layerManager, canvasEngine, imageLoader) {
    this.layers = layerManager;
    this.engine = canvasEngine;
    this.imageLoader = imageLoader;

    this._dragging = null;      // { obj, handle, startImgX, startImgY }
    this._dragStarted = false;
    this._mouseDownPos = null;
    this._editingNote = null;

    this._setup();
  }

  _setup() {
    const container = $('#canvas-container');

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (bus._currentTool === 'brush' || bus._currentTool === 'eraser') return;
      // Prevent canvas interactions if clicking on inline UI overlays
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.closest('.inline-pin-label-input') || e.target.closest('div[style*="var(--bg-surface)"]')) return;
      
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);

      let hitHandle = null;
      let hitObj = null;

      const objs = this.layers.getActiveObjects();
      for (let i = objs.length - 1; i >= 0; i--) {
        const h = objs[i].hitHandle?.(imgX, imgY, this.engine.scale);
        if (h) { hitHandle = h; hitObj = objs[i]; break; }
      }
      if (!hitObj) {
        hitObj = this.layers.getObjectAt(imgX, imgY, this.engine.scale);
      }

      // If we clicked an object/handle (or if we are just interacting with the move tool)
      if (hitObj) {
        if (bus._currentTool !== 'move') {
          // Auto switch to move tool via the global app context
          if (window.app && window.app.toolManager) {
            window.app.toolManager.setTool('move');
          } else {
            bus._currentTool = 'move';
          }
        }
        
        e.stopPropagation(); // Stop creation tools from receiving this click!
        
        this._mouseDownPos = { clientX: e.clientX, clientY: e.clientY, imgX, imgY };
        this._dragStarted = false;
        this._dragging = { obj: hitObj, handle: hitHandle, startImgX: imgX, startImgY: imgY, origX: hitObj.x, origY: hitObj.y };
        
        this.layers.deselectAll();
        hitObj.selected = true;
        this.engine.render();
      } else {
        // Did not hit an object. If we are in MoveTool, deselect all.
        if (bus._currentTool === 'move') {
          this.layers.deselectAll();
          this.engine.render();
        }
      }
    }, true); // CAPTURE PHASE!

    window.addEventListener('mousemove', (e) => {
      if (!this._dragging || !this._mouseDownPos || bus._currentTool !== 'move') return;
      const dx = e.clientX - this._mouseDownPos.clientX;
      const dy = e.clientY - this._mouseDownPos.clientY;
      if (!this._dragStarted && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) this._dragStarted = true;
      if (!this._dragStarted) return;

      const rect = $('#canvas-container').getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      const { obj, handle } = this._dragging;

      if (handle) {
        // Resize or move endpoint
        obj.resizeHandle(handle, imgX, imgY);
        // Resample if comparison endpoint
        if (obj.type === 'comparison') this._resampleComparison(obj, handle, imgX, imgY);
        // Reanalyze if region
        if (obj.type === 'region') this._reanalyzeRegion(obj);
      } else {
        // Move object
        const dix = imgX - (this._dragging.lastImgX || this._mouseDownPos.imgX);
        const diy = imgY - (this._dragging.lastImgY || this._mouseDownPos.imgY);
        obj.move(dix, diy);
        // Resample pin color
        if (obj.type === 'pin') this._resamplePin(obj);
      }
      this._dragging.lastImgX = imgX;
      this._dragging.lastImgY = imgY;
      this.engine.render();
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (this._dragging) {
        if (this._dragging.obj.type === 'region' && this._dragStarted) {
          this._reanalyzeRegion(this._dragging.obj);
        }
        this._dragging = null;
      }
      this._mouseDownPos = null;
      bus.emit('layers:objects-changed');
    });

    // Double-click for editing
    container.addEventListener('dblclick', (e) => {
      if (bus._currentTool !== 'move') return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      const obj = this.layers.getObjectAt(imgX, imgY, this.engine.scale);
      if (!obj) {
        const p = this.imageLoader.getPixel(imgX, imgY);
        if (p) {
          const hsl = rgbToHsl(p.r, p.g, p.b);
          const hsv = rgbToHsv(p.r, p.g, p.b);
          const b = perceivedBrightness(p.r, p.g, p.b);
          colorDetailsModal.show({
            r: p.r, g: p.g, b: p.b, hex: rgbToHex(p.r, p.g, p.b),
            hsl, hsv, brightness: b, brightLabel: brightnessLabel(b),
            imgX, imgY
          });
        }
        return;
      }
      if (obj.type === 'note') {
        this._editNote(obj);
      } else if (obj.type === 'pin') {
        colorDetailsModal.show(obj);
      } else if (obj.type === 'comparison') {
        const handle = obj.hitHandle(imgX, imgY, this.engine.scale);
        if (handle === 'start') colorDetailsModal.show(obj.start);
        else if (handle === 'end') colorDetailsModal.show(obj.end);
        else comparisonDetailsModal.show(obj);
      }
    });

    // Cursor hint
    container.addEventListener('mousemove', (e) => {
      if (bus._currentTool !== 'move' || this._dragging) return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      // Check handles for resize cursor
      const objs = this.layers.getActiveObjects();
      let cursor = 'default';
      for (let i = objs.length - 1; i >= 0; i--) {
        const h = objs[i].hitHandle?.(imgX, imgY, this.engine.scale);
        if (h) { cursor = 'nwse-resize'; break; }
        if (objs[i].hitTest(imgX, imgY, this.engine.scale)) { cursor = 'move'; break; }
      }
      container.style.cursor = cursor;
    });
  }

  _resamplePin(pin) {
    const pixel = this.imageLoader.getPixel(pin.x, pin.y);
    if (!pixel) return;
    const hsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
    const hsv = rgbToHsv(pixel.r, pixel.g, pixel.b);
    Object.assign(pin, {
      r: pixel.r, g: pixel.g, b: pixel.b,
      hex: rgbToHex(pixel.r, pixel.g, pixel.b),
      hsl, hsv,
      brightness: perceivedBrightness(pixel.r, pixel.g, pixel.b),
      temp: colorTemperature(hsl.h, hsl.s),
      satLabel: saturationLabel(hsl.s),
      brightLabel: brightnessLabel(hsl.l),
    });
  }

  _resampleComparison(comp, handle, imgX, imgY) {
    const pixel = this.imageLoader.getPixel(imgX, imgY);
    if (!pixel) return;
    const hsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
    const hsv = rgbToHsv(pixel.r, pixel.g, pixel.b);
    const hex = rgbToHex(pixel.r, pixel.g, pixel.b);
    const brightness = perceivedBrightness(pixel.r, pixel.g, pixel.b);
    const data = { 
      imgX, imgY, 
      r: pixel.r, g: pixel.g, b: pixel.b,
      hex, hsl, hsv, brightness 
    };
    if (handle === 'start') comp.start = data;
    else comp.end = data;
    // Recalculate delta inline
    const dh = Math.min(Math.abs(comp.start.hsl.h - comp.end.hsl.h), 360 - Math.abs(comp.start.hsl.h - comp.end.hsl.h));
    comp.delta = {
      deltaH: dh,
      deltaS: Math.abs(comp.start.hsl.s - comp.end.hsl.s),
      deltaL: Math.abs(comp.start.hsl.l - comp.end.hsl.l)
    };
    comp.dBright = Math.abs(comp.start.brightness - comp.end.brightness);
  }

  _reanalyzeRegion(region) {
    if (!this.imageLoader.imageData) return;
    region.stats = ColorStats.analyzeRegion(
      this.imageLoader.imageData,
      region.x, region.y, region.w, region.h
    );
  }

  _editNote(note) {
    this._removeEditor();
    const { sx, sy } = this.engine.imageToScreen(note.x, note.y);
    const container = $('#canvas-container');

    const panel = createElement('div', { className: 'inline-note-editor', style: { position: 'absolute', left: (sx + 15) + 'px', top: (sy - 10) + 'px', zIndex: 60 } });
    const textarea = createElement('textarea', { className: 'inline-note-text', textContent: note.text });
    const colors = createElement('div', { className: 'inline-note-colors' });
    const noteColors = ['#f43f5e', '#f97316', '#22c55e', '#3b82f6', '#8b5cf6', '#ffffff'];
    noteColors.forEach(c => {
      const btn = createElement('div', {
        className: `inline-color-btn${c === note.color ? ' active' : ''}`,
        style: { backgroundColor: c },
        onClick: () => {
          note.color = c;
          colors.querySelectorAll('.inline-color-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
      colors.appendChild(btn);
    });
    panel.appendChild(textarea);
    panel.appendChild(colors);
    panel.addEventListener('mousedown', e => e.stopPropagation());
    container.appendChild(panel);
    textarea.focus();
    this._editingNote = panel;

    const save = () => {
      note.text = textarea.value.trim() || note.text;
      this._removeEditor();
      this.engine.render();
      bus.emit('layers:objects-changed');
    };
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
      if (e.key === 'Escape') { this._removeEditor(); this.engine.render(); }
    });
    // Save on click outside
    setTimeout(() => {
      const handler = (e) => {
        if (!panel.contains(e.target)) { save(); window.removeEventListener('mousedown', handler); }
      };
      window.addEventListener('mousedown', handler);
    }, 100);
  }



  _removeEditor() {
    if (this._editingNote) { this._editingNote.remove(); this._editingNote = null; }
  }
}
