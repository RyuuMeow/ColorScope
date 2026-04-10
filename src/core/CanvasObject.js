/**
 * CanvasObject — Base class for all canvas objects
 * Unified interface: hitTest, move, render, serialize
 */
import { colorName } from './ColorMath.js';
import { getUIScale } from '../ui/SettingsModal.js';

let _objectIdCounter = 0;

export class CanvasObject {
  constructor(type) {
    this.id = ++_objectIdCounter;
    this.type = type;
    this.selected = false;
    this.hovered = false;
  }
  hitTest(imgX, imgY, scale) { return false; }
  hitHandle(imgX, imgY, scale) { return null; }
  getBounds() { return { x: 0, y: 0, w: 0, h: 0 }; }
  isInRect(rx, ry, rw, rh) {
    const b = this.getBounds();
    return !(b.x + b.w < rx || b.x > rx + rw || b.y + b.h < ry || b.y > ry + rh);
  }
  move(dx, dy) {}
  resizeHandle(handle, imgX, imgY) {}
  render(ctx, scale, offsetX, offsetY, options) {}
  serialize() { return { id: this.id, type: this.type }; }

  static deserialize(data) {
    if (!data || !data.type) return null;
    let obj;
    switch (data.type) {
      case 'pin':
        obj = new PinObject(data.x, data.y, data);
        break;
      case 'brush':
        obj = new BrushStrokeObject(data);
        break;
      case 'note':
        obj = new NoteObject(data.x, data.y, data.color);
        Object.assign(obj, data);
        break;
      case 'region':
        obj = new RegionObject(data.x, data.y, data.w, data.h, data.color, data.label, data.data);
        obj.id = data.id;
        break;
      case 'comparison':
        obj = new ComparisonObject(data.start, data.end);
        obj.delta = data.delta;
        obj.dBright = data.dBright;
        obj.id = data.id;
        break;
      default: return null;
    }
    if (obj) obj.id = data.id;
    return obj;
  }
}

export function resetObjectCounter(val = 0) { _objectIdCounter = val; }
export function getObjectCounter() { return _objectIdCounter; }

// ====================================================================
// PIN — map-pin style with clean info tag
// ====================================================================
export class PinObject extends CanvasObject {
  constructor(x, y, colorData) {
    super('pin');
    this.x = Math.floor(x);
    this.y = Math.floor(y);
    this.label = `圖釘 ${this.id}`;
    Object.assign(this, colorData);
  }

  hitTest(imgX, imgY, scale) {
    const r = Math.max(16, 16 / scale);
    return (imgX - this.x) ** 2 + (imgY - this.y) ** 2 < r * r;
  }
  getBounds() { return { x: this.x - 8, y: this.y - 8, w: 16, h: 16 }; }
  move(dx, dy) { this.x += dx; this.y += dy; }

  render(ctx, scale, offsetX, offsetY, opts = {}) {
    const sx = this.x * scale + offsetX;
    const sy = this.y * scale + offsetY;
    const sel = this.selected;
    const uis = getUIScale() * (opts.exportScale || 1.0);

    ctx.save();

    // === Pin marker (teardrop shape) ===
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6 * uis;
    ctx.shadowOffsetY = 2 * uis;

    // Outer white circle
    const or = sel ? 11 * uis : 8 * uis;
    ctx.beginPath();
    ctx.arc(sx, sy, or + 2 * uis, 0, Math.PI * 2);
    ctx.fillStyle = sel ? '#6366f1' : '#fff';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Inner color fill
    ctx.beginPath();
    ctx.arc(sx, sy, or, 0, Math.PI * 2);
    ctx.fillStyle = this.hex || '#888';
    ctx.fill();

    // Selection ring
    if (sel) {
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, or + 5 * uis, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // === Clean info label ===
    const cName = colorName(this.hsl?.h || 0, this.hsl?.s || 0, this.hsl?.l || 0);
    const hex = (this.hex || '').toUpperCase();
    const tagText = `${cName}  ${hex}  H${this.hsv?.h || 0} S${this.hsv?.s || 0} V${this.hsv?.v || 0}`;
    ctx.font = `${10 * uis}px Inter, Noto Sans TC, sans-serif`;
    const tw = ctx.measureText(tagText).width;
    const tagW = tw + 26 * uis; // Added padding to compensate for standard offset
    const tagH = 20 * uis;
    const tagX = sx + or + 6 * uis;
    const tagY = sy - tagH / 2;

    // Tag background — frosted pill
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath(); ctx.roundRect(tagX, tagY, tagW, tagH, 10 * uis); ctx.fill();

    // Tiny color dot in tag
    ctx.fillStyle = this.hex || '#888';
    ctx.beginPath(); ctx.arc(tagX + 9 * uis, tagY + tagH / 2, 3.5 * uis, 0, Math.PI * 2); ctx.fill();

    // Tag text
    ctx.fillStyle = '#ffffffcc';
    ctx.textAlign = 'left';
    ctx.fillText(tagText, tagX + 16 * uis, tagY + tagH / 2 + 3.5 * uis);

    ctx.restore();
  }

  serialize() {
    return {
      id: this.id, type: 'pin', x: this.x, y: this.y,
      label: this.label, hex: this.hex, hsl: this.hsl, hsv: this.hsv,
      brightness: this.brightness, temp: this.temp, satLabel: this.satLabel,
      brightLabel: this.brightLabel, r: this.r, g: this.g, b: this.b
    };
  }
}

// ====================================================================
// NOTE — sticky note / Post-it style
// ====================================================================
export class NoteObject extends CanvasObject {
  constructor(x, y, text = '', color = '#fbbf24') {
    super('note');
    this.x = Math.floor(x);
    this.y = Math.floor(y);
    this.text = text;
    this.color = color;
    this.noteW = 160;
    this.noteH = 0; // auto-calculated
    this.customScale = 1.0;
  }

  hitTest(imgX, imgY, scale) {
    if (!this.text) {
      const r = Math.max(20, 20 / scale);
      return (imgX - this.x) ** 2 + (imgY - this.y) ** 2 < r * r;
    }
    const uis = getUIScale();
    const pad = 10 / scale;
    const cw = (this.noteW * this.customScale * uis) / scale;
    const ch = ((this.noteH || 60) * this.customScale * uis) / scale;
    return imgX >= this.x - pad && imgX <= this.x + cw + pad &&
           imgY >= this.y - pad && imgY <= this.y + ch + pad;
  }

  hitHandle(imgX, imgY, scale) {
    if (!this.text || !this.selected) return null;
    const uis = getUIScale();
    const hr = Math.max(8, 10 / scale);
    const w = (this.noteW * this.customScale * uis) / scale;
    const h = ((this.noteH || 60) * this.customScale * uis) / scale;
    const corners = { tl: [this.x, this.y], tr: [this.x + w, this.y], bl: [this.x, this.y + h], br: [this.x + w, this.y + h] };
    for (const [name, [cx, cy]] of Object.entries(corners)) {
      if (Math.abs(imgX - cx) < hr && Math.abs(imgY - cy) < hr) return name;
    }
    return null;
  }

  getBounds() { 
    const uis = getUIScale();
    return { x: this.x, y: this.y, w: this.noteW * this.customScale * uis, h: (this.noteH || 60) * this.customScale * uis }; 
  }
  move(dx, dy) { this.x += dx; this.y += dy; }

  resizeHandle(handle, imgX, imgY) {
    const scale = window.app?.canvasEngine?.scale || 1;
    const uis = getUIScale();
    const oldW = (this.noteW * this.customScale * uis) / scale;
    const oldH = ((this.noteH || 60) * this.customScale * uis) / scale;
    
    let fixedX = this.x, fixedY = this.y, newDistX = oldW;

    if (handle === 'tl') {
      fixedX = this.x + oldW;
      fixedY = this.y + oldH;
      newDistX = fixedX - imgX;
    } else if (handle === 'tr') {
      fixedX = this.x;
      fixedY = this.y + oldH;
      newDistX = imgX - this.x;
    } else if (handle === 'bl') {
      fixedX = this.x + oldW;
      fixedY = this.y;
      newDistX = fixedX - imgX;
    } else if (handle === 'br') {
      fixedX = this.x;
      fixedY = this.y;
      newDistX = imgX - this.x;
    }
    
    if (newDistX < 40 / scale) newDistX = 40 / scale;
    this.customScale = newDistX / ((this.noteW * uis) / scale);
    
    const newW = (this.noteW * this.customScale * uis) / scale;
    const newH = ((this.noteH || 60) * this.customScale * uis) / scale;

    if (handle === 'tl') {
      this.x = fixedX - newW;
      this.y = fixedY - newH;
    } else if (handle === 'tr') {
      this.x = fixedX;
      this.y = fixedY - newH;
    } else if (handle === 'bl') {
      this.x = fixedX - newW;
      this.y = fixedY;
    } else if (handle === 'br') {
      this.x = fixedX;
      this.y = fixedY;
    }
  }

  render(ctx, scale, offsetX, offsetY, opts = {}) {
    const sx = this.x * scale + offsetX;
    const sy = this.y * scale + offsetY;
    const uis = getUIScale() * (opts.exportScale || 1.0);

    ctx.save();

    if (!this.text) {
      // Placement dot when empty
      ctx.beginPath();
      ctx.arc(sx, sy, (this.selected ? 7 : 4) * uis, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.restore();
      return;
    }

    // === Post-it note ===
    // Text measurement runs at base scale
    ctx.font = `${11 * uis}px Inter, Noto Sans TC, sans-serif`;
    const padX = 10 * uis, padTop = 10 * uis, padBottom = 8 * uis;
    const maxW = 300 * uis;
    const lines = this._wrapText(ctx, this.text, maxW - padX * 2);
    
    let actualTextW = 0;
    lines.forEach(l => {
      const lw = ctx.measureText(l).width;
      if (lw > actualTextW) actualTextW = lw;
    });
    
    const noteW = Math.max(80 * uis, actualTextW + padX * 2);
    this.noteW = noteW / uis;

    const lineH = 17 * uis;
    const noteH = padTop + lines.length * lineH + padBottom;
    // Store un-uis-scaled base height!
    this.noteH = noteH / uis; 

    ctx.translate(sx, sy);
    ctx.scale(this.customScale, this.customScale);
    
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    // Note body
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.roundRect(0, 0, noteW, noteH, 3); ctx.fill();
    ctx.shadowColor = 'transparent';

    // Fold corner
    ctx.fillStyle = this._darken(this.color, 0.15);
    ctx.beginPath();
    ctx.moveTo(noteW - 12, 0);
    ctx.lineTo(noteW, 0);
    ctx.lineTo(noteW, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = this._darken(this.color, 0.08);
    ctx.beginPath();
    ctx.moveTo(noteW - 12, 0);
    ctx.lineTo(noteW, 12);
    ctx.lineTo(noteW - 12, 12);
    ctx.closePath();
    ctx.fill();

    // Text
    const textColor = this._isLight(this.color) ? '#1a1a1a' : '#ffffff';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      ctx.fillText(line, padX, padTop + 12 + i * lineH);
    });

    // Selection border and handles
    if (this.selected) {
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1.5 / this.customScale; // Keep line width visually consistent
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(-1, -1, noteW + 2, noteH + 2);
      ctx.setLineDash([]);
      
      const hs = 4 / this.customScale;
      [[0, 0], [noteW, 0], [0, noteH], [noteW, noteH]].forEach(([hx, hy]) => {
        ctx.fillStyle = '#6366f1';
        ctx.beginPath(); ctx.arc(hx, hy, hs, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 / this.customScale;
        ctx.beginPath(); ctx.arc(hx, hy, hs, 0, Math.PI * 2); ctx.stroke();
      });
    }

    ctx.restore();
  }

  _wrapText(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const c of text) {
      if (c === '\n') { lines.push(line); line = ''; continue; }
      const test = line + c;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = c; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  _darken(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`;
  }

  _isLight(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 140;
  }

  serialize() {
    return { id: this.id, type: 'note', x: this.x, y: this.y, text: this.text, color: this.color };
  }
}

// ====================================================================
// REGION (movable, resizable, with stats label)
// ====================================================================
export class RegionObject extends CanvasObject {
  constructor(x, y, w, h, stats = null) {
    super('region');
    this.x = Math.floor(x);
    this.y = Math.floor(y);
    this.w = Math.floor(w);
    this.h = Math.floor(h);
    this.stats = stats;
  }

  hitTest(imgX, imgY) {
    return imgX >= this.x && imgX <= this.x + this.w &&
           imgY >= this.y && imgY <= this.y + this.h;
  }

  hitHandle(imgX, imgY, scale) {
    const hr = Math.max(8, 10 / scale);
    const corners = { tl: [this.x, this.y], tr: [this.x + this.w, this.y], bl: [this.x, this.y + this.h], br: [this.x + this.w, this.y + this.h] };
    for (const [name, [cx, cy]] of Object.entries(corners)) {
      if (Math.abs(imgX - cx) < hr && Math.abs(imgY - cy) < hr) return name;
    }
    return null;
  }

  getBounds() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  move(dx, dy) { this.x += dx; this.y += dy; }

  resizeHandle(handle, imgX, imgY) {
    const x2 = this.x + this.w, y2 = this.y + this.h;
    if (handle === 'tl') { this.x = imgX; this.y = imgY; this.w = x2 - imgX; this.h = y2 - imgY; }
    else if (handle === 'tr') { this.y = imgY; this.w = imgX - this.x; this.h = y2 - imgY; }
    else if (handle === 'bl') { this.x = imgX; this.w = x2 - imgX; this.h = imgY - this.y; }
    else if (handle === 'br') { this.w = imgX - this.x; this.h = imgY - this.y; }
    if (this.w < 0) { this.x += this.w; this.w = Math.abs(this.w); }
    if (this.h < 0) { this.y += this.h; this.h = Math.abs(this.h); }
  }

  render(ctx, scale, offsetX, offsetY, opts = {}) {
    const x = this.x * scale + offsetX;
    const y = this.y * scale + offsetY;
    const w = this.w * scale;
    const h = this.h * scale;
    const uis = getUIScale() * (opts.exportScale || 1.0);

    ctx.save();
    ctx.fillStyle = this.selected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = this.selected ? '#6366f1' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = this.selected ? 2 : 1.5;
    ctx.setLineDash(this.selected ? [] : [5, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Stats tag
    if (this.stats) {
      const label = `${this.stats.brightLabel} · ${this.stats.satLabel}`;
      ctx.font = `${10 * uis}px Inter, Noto Sans TC, sans-serif`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath(); ctx.roundRect(x, y - (20 * uis), tw + (12 * uis), 18 * uis, 4 * uis); ctx.fill();
      ctx.fillStyle = '#ffffffcc';
      ctx.fillText(label, x + (6 * uis), y - (6 * uis));
    }

    // Handles
    if (this.selected) {
      const hs = 4;
      [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([hx, hy]) => {
        ctx.fillStyle = '#6366f1';
        ctx.beginPath(); ctx.arc(hx, hy, hs, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(hx, hy, hs, 0, Math.PI * 2); ctx.stroke();
      });
    }
    ctx.restore();
  }

  serialize() {
    return { id: this.id, type: 'region', x: this.x, y: this.y, w: this.w, h: this.h, stats: this.stats };
  }
}

// ====================================================================
// COMPARISON — clean side-by-side with difference summary
// ====================================================================
export class ComparisonObject extends CanvasObject {
  constructor(start, end) {
    super('comparison');
    this.start = { ...start };
    this.end = { ...end };
    this.delta = null;
    this.dBright = 0;
  }

  hitTest(imgX, imgY, scale) {
    return this._hitEp(imgX, imgY, scale, 'start') ||
           this._hitEp(imgX, imgY, scale, 'end') ||
           this._hitLine(imgX, imgY, scale) ||
           this.hitHandle(imgX, imgY, scale) === 'midpoint';
  }

  _hitEp(imgX, imgY, scale, which) {
    const p = this[which];
    const r = Math.max(16, 16 / scale);
    return (imgX - p.imgX) ** 2 + (imgY - p.imgY) ** 2 < r * r;
  }

  _hitLine(imgX, imgY, scale) {
    const t = Math.max(20, 24 / scale); // Huge hit-box for easy double clicking
    const { imgX: x1, imgY: y1 } = this.start;
    const { imgX: x2, imgY: y2 } = this.end;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (!len) return false;
    const d = Math.abs((y2 - y1) * imgX - (x2 - x1) * imgY + x2 * y1 - y2 * x1) / len;
    if (d > t) return false;
    const p = ((imgX - x1) * (x2 - x1) + (imgY - y1) * (y2 - y1)) / (len * len);
    return p >= -0.1 && p <= 1.1; // Extend slightly to cover endpoints gracefully
  }

  hitHandle(imgX, imgY, scale) {
    if (this._hitEp(imgX, imgY, scale, 'start')) return 'start';
    if (this._hitEp(imgX, imgY, scale, 'end')) return 'end';
    
    const mx = (this.start.imgX + this.end.imgX) / 2;
    const my = (this.start.imgY + this.end.imgY) / 2;
    if ((imgX - mx) ** 2 + (imgY - my) ** 2 < Math.max(30, 40 / scale) ** 2) return 'midpoint';
    
    return null;
  }

  getBounds() {
    const x = Math.min(this.start.imgX, this.end.imgX);
    const y = Math.min(this.start.imgY, this.end.imgY);
    return { x, y, w: Math.abs(this.end.imgX - this.start.imgX), h: Math.abs(this.end.imgY - this.start.imgY) };
  }

  move(dx, dy) {
    this.start.imgX += dx; this.start.imgY += dy;
    this.end.imgX += dx; this.end.imgY += dy;
  }

  resizeHandle(handle, imgX, imgY) {
    if (handle === 'start') { this.start.imgX = imgX; this.start.imgY = imgY; }
    else if (handle === 'end') { this.end.imgX = imgX; this.end.imgY = imgY; }
  }

  render(ctx, scale, offsetX, offsetY, opts = {}) {
    const sx1 = this.start.imgX * scale + offsetX;
    const sy1 = this.start.imgY * scale + offsetY;
    const sx2 = this.end.imgX * scale + offsetX;
    const sy2 = this.end.imgY * scale + offsetY;
    const uis = getUIScale() * (opts.exportScale || 1.0);

    ctx.save();

    // Line
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = this.selected ? '#818cf8' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
    ctx.setLineDash([]);

    // Endpoints — hollow diamond style (distinct from pin circles)
    this._drawDiamond(ctx, sx1, sy1, this.start, uis);
    this._drawDiamond(ctx, sx2, sy2, this.end, uis);

    // === Midpoint diff badge ===
    if (this.delta) {
      const mx = (sx1 + sx2) / 2, my = (sy1 + sy2) / 2;
      const diffText = `明度差${this.dBright}%  ΔL${this.delta.deltaL}  ΔH${this.delta.deltaH}°  ΔS${this.delta.deltaS}`;
      ctx.font = `${9 * uis}px Inter, sans-serif`;
      const tw = ctx.measureText(diffText).width;
      const bw = tw + (14 * uis) + (24 * uis); // extra for two mini swatches
      const bh = 18 * uis;
      const bx = mx - bw / 2, by = my - bh / 2;

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 9 * uis); ctx.fill();

      // Mini swatch A
      ctx.fillStyle = this.start.hex || '#888';
      ctx.beginPath(); ctx.arc(bx + 9 * uis, my, 4 * uis, 0, Math.PI * 2); ctx.fill();
      // Mini swatch B
      ctx.fillStyle = this.end.hex || '#888';
      ctx.beginPath(); ctx.arc(bx + bw - 9 * uis, my, 4 * uis, 0, Math.PI * 2); ctx.fill();

      // Text
      ctx.fillStyle = '#ffffffcc';
      ctx.textAlign = 'center';
      ctx.fillText(diffText, mx, my + 3 * uis);
    }

    ctx.restore();
  }

  _drawDiamond(ctx, x, y, data, uis) {
    const s = 8 * uis;
    const hex = data.hex;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = hex || '#888';
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }

  serialize() {
    return { id: this.id, type: 'comparison', start: { ...this.start }, end: { ...this.end }, delta: this.delta, dBright: this.dBright };
  }
}

// ====================================================================
// BRUSH STROKE / ERASER
// ====================================================================
export class BrushStrokeObject extends CanvasObject {
  constructor(data = {}) {
    super('brush');
    this.mode = data.mode === 'erase' ? 'erase' : 'paint';
    this.color = data.color || '#ff6b6b';
    this.size = Math.max(1, Number(data.size) || 18);
    this.opacity = Math.max(0.01, Math.min(1, Number(data.opacity) || 0.9));
    this.flow = Math.max(0.01, Math.min(1, Number(data.flow) || 0.85));
    this.hardness = Math.max(0.05, Math.min(1, Number(data.hardness) || 0.75));
    this.pressureSize = !!data.pressureSize;
    this.pressureOpacity = !!data.pressureOpacity;
    this.points = Array.isArray(data.points) ? data.points.map((point) => ({
      x: Number(point.x) || 0,
      y: Number(point.y) || 0,
      size: Math.max(0.5, Number(point.size) || this.size),
      alpha: Math.max(0.01, Math.min(1, Number(point.alpha) || 1))
    })) : [];
    this._cacheCanvas = null;
    this._cacheCtx = null;
    this._cacheBounds = null;
    this._renderedPointCount = 0;
    this._pendingStartIndex = this.points.length ? 0 : null;
  }

  addPoint(x, y, pressure = 1) {
    const resolvedPressure = Math.max(0.05, Math.min(1, pressure || 1));
    const sizeFactor = this.pressureSize ? (0.25 + resolvedPressure * 0.75) : 1;
    const opacityFactor = this.pressureOpacity
      ? Math.max(0.02, Math.min(1, resolvedPressure ** 1.8))
      : 1;
    const point = {
      x,
      y,
      size: Math.max(0.5, this.size * sizeFactor),
      alpha: Math.max(0.01, Math.min(1, opacityFactor))
    };

    if (this.points.length === 0) {
      this.points.push(point);
      this._pendingStartIndex = 0;
      return;
    }

    const prev = this.points[this.points.length - 1];
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    const distance = Math.hypot(dx, dy);
    const flowFactor = Math.max(0.08, this.flow);
    const spacing = Math.max(0.85, Math.min(prev.size, point.size) * (0.55 - flowFactor * 0.45));
    const steps = Math.max(1, Math.ceil(distance / spacing));
    const startIndex = this.points.length;

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      this.points.push({
        x: prev.x + dx * t,
        y: prev.y + dy * t,
        size: prev.size + (point.size - prev.size) * t,
        alpha: prev.alpha + (point.alpha - prev.alpha) * t
      });
    }
    this._pendingStartIndex = this._pendingStartIndex === null
      ? startIndex
      : Math.min(this._pendingStartIndex, startIndex);
  }

  hitTest(imgX, imgY, scale = 1) {
    if (this.points.length === 0) return false;
    const tolerance = Math.max(3, 6 / scale);
    for (const point of this.points) {
      const radius = point.size / 2 + tolerance;
      if ((imgX - point.x) ** 2 + (imgY - point.y) ** 2 <= radius ** 2) return true;
    }
    return false;
  }

  getBounds() {
    if (this.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of this.points) {
      const radius = point.size / 2;
      minX = Math.min(minX, point.x - radius);
      minY = Math.min(minY, point.y - radius);
      maxX = Math.max(maxX, point.x + radius);
      maxY = Math.max(maxY, point.y + radius);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  move(dx, dy) {
    this.points = this.points.map((point) => ({
      ...point,
      x: point.x + dx,
      y: point.y + dy
    }));
    if (this._cacheBounds) {
      this._cacheBounds = {
        ...this._cacheBounds,
        x: this._cacheBounds.x + dx,
        y: this._cacheBounds.y + dy
      };
    }
  }

  render(ctx, scale, offsetX, offsetY) {
    if (!this.points.length) return;
    this._syncCache();
    ctx.save();
    ctx.globalCompositeOperation = this.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = this.opacity;
    if (this._cacheCanvas && this._cacheBounds) {
      ctx.drawImage(
        this._cacheCanvas,
        this._cacheBounds.x * scale + offsetX,
        this._cacheBounds.y * scale + offsetY,
        this._cacheCanvas.width * scale,
        this._cacheCanvas.height * scale
      );
    }
    ctx.restore();

    const activeTool = window.app?.toolManager?.activeTool;
    if (this.selected && activeTool !== 'brush' && activeTool !== 'eraser') {
      const bounds = this.getBounds();
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = this.mode === 'erase' ? '#f59e0b' : '#6366f1';
      ctx.strokeRect(
        bounds.x * scale + offsetX,
        bounds.y * scale + offsetY,
        bounds.w * scale,
        bounds.h * scale
      );
      ctx.restore();
    }
  }

  _hexToRgba(hex, alpha) {
    const safeHex = (hex || '#000000').replace('#', '');
    const normalized = safeHex.length === 3
      ? safeHex.split('').map((char) => char + char).join('')
      : safeHex.padEnd(6, '0');
    const r = parseInt(normalized.slice(0, 2), 16) || 0;
    const g = parseInt(normalized.slice(2, 4), 16) || 0;
    const b = parseInt(normalized.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  _syncCache() {
    if (!this.points.length) return;

    const requiredBounds = this._computeCacheBounds();
    if (!this._cacheCanvas || !this._cacheBounds) {
      this._createCache(requiredBounds);
      this._pendingStartIndex = 0;
    } else if (this._needsCacheResize(requiredBounds)) {
      this._resizeCache(requiredBounds);
    }

    const startIndex = this._pendingStartIndex === null ? this._renderedPointCount : this._pendingStartIndex;
    if (startIndex < this.points.length) {
      this._renderPointsToCache(startIndex);
      this._renderedPointCount = this.points.length;
      this._pendingStartIndex = null;
    }
  }

  _computeCacheBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxRadius = 0;
    for (const point of this.points) {
      const radius = point.size / 2;
      maxRadius = Math.max(maxRadius, radius);
      minX = Math.min(minX, point.x - radius);
      minY = Math.min(minY, point.y - radius);
      maxX = Math.max(maxX, point.x + radius);
      maxY = Math.max(maxY, point.y + radius);
    }
    const padding = Math.ceil(maxRadius + 3);
    return {
      x: Math.floor(minX - padding),
      y: Math.floor(minY - padding),
      w: Math.max(1, Math.ceil(maxX - minX + padding * 2)),
      h: Math.max(1, Math.ceil(maxY - minY + padding * 2))
    };
  }

  _needsCacheResize(requiredBounds) {
    if (!this._cacheBounds) return true;
    const current = this._cacheBounds;
    return requiredBounds.x !== current.x
      || requiredBounds.y !== current.y
      || requiredBounds.w !== current.w
      || requiredBounds.h !== current.h;
  }

  _createCache(bounds) {
    this._cacheCanvas = document.createElement('canvas');
    this._cacheCanvas.width = bounds.w;
    this._cacheCanvas.height = bounds.h;
    this._cacheCtx = this._cacheCanvas.getContext('2d');
    this._cacheBounds = bounds;
    this._renderedPointCount = 0;
  }

  _resizeCache(bounds) {
    const prevCanvas = this._cacheCanvas;
    const prevBounds = this._cacheBounds;
    const prevRenderedCount = this._renderedPointCount;
    this._createCache(bounds);
    if (prevCanvas && prevBounds && this._cacheCtx) {
      this._cacheCtx.drawImage(prevCanvas, prevBounds.x - bounds.x, prevBounds.y - bounds.y);
    }
    this._renderedPointCount = prevRenderedCount;
    this._pendingStartIndex = this._pendingStartIndex === null ? prevRenderedCount : Math.min(this._pendingStartIndex, prevRenderedCount);
  }

  _renderPointsToCache(startIndex) {
    if (!this._cacheCtx || !this._cacheBounds) return;
    const hardEdge = Math.max(0, Math.min(1, this.hardness));
    const flowAlpha = Math.max(0.02, Math.min(1, this.flow));
    for (let i = startIndex; i < this.points.length; i++) {
      const point = this.points[i];
      const radius = Math.max(0.5, point.size / 2);
      const sx = point.x - this._cacheBounds.x;
      const sy = point.y - this._cacheBounds.y;
      const alpha = Math.max(0.01, Math.min(1, point.alpha * flowAlpha));
      const solidColor = this.mode === 'erase' ? `rgba(0,0,0,${alpha})` : this._hexToRgba(this.color, alpha);

      if (i > 0) {
        const prev = this.points[i - 1];
        const prevSx = prev.x - this._cacheBounds.x;
        const prevSy = prev.y - this._cacheBounds.y;
        const avgSize = Math.max(0.5, (prev.size + point.size) / 2);
        const avgAlpha = Math.max(0.01, Math.min(1, Math.min(prev.alpha, point.alpha) * flowAlpha));
        const segmentColor = this.mode === 'erase' ? `rgba(0,0,0,${avgAlpha})` : this._hexToRgba(this.color, avgAlpha);
        this._cacheCtx.save();
        this._cacheCtx.lineCap = 'round';
        this._cacheCtx.lineJoin = 'round';
        this._cacheCtx.strokeStyle = segmentColor;
        this._cacheCtx.lineWidth = Math.max(1, avgSize * (0.58 + hardEdge * 0.42));
        if (hardEdge < 0.999) {
          this._cacheCtx.shadowBlur = avgSize * (1 - hardEdge) * 0.45;
          this._cacheCtx.shadowColor = segmentColor;
        }
        this._cacheCtx.beginPath();
        this._cacheCtx.moveTo(prevSx, prevSy);
        this._cacheCtx.lineTo(sx, sy);
        this._cacheCtx.stroke();
        this._cacheCtx.restore();
      }

      if (i === 0 || this.points.length === 1) {
        if (hardEdge >= 0.999) {
          this._cacheCtx.fillStyle = solidColor;
        } else {
          const gradient = this._cacheCtx.createRadialGradient(sx, sy, radius * hardEdge, sx, sy, radius);
          const edgeColor = this.mode === 'erase' ? 'rgba(0,0,0,0)' : this._hexToRgba(this.color, 0);
          gradient.addColorStop(0, solidColor);
          gradient.addColorStop(Math.max(0.02, hardEdge), solidColor);
          gradient.addColorStop(1, edgeColor);
          this._cacheCtx.fillStyle = gradient;
        }
        this._cacheCtx.beginPath();
        this._cacheCtx.arc(sx, sy, radius, 0, Math.PI * 2);
        this._cacheCtx.fill();
      }
    }
  }

  serialize() {
    return {
      id: this.id,
      type: 'brush',
      mode: this.mode,
      color: this.color,
      size: this.size,
      opacity: this.opacity,
      flow: this.flow,
      hardness: this.hardness,
      pressureSize: this.pressureSize,
      pressureOpacity: this.pressureOpacity,
      points: this.points.map((point) => ({ ...point }))
    };
  }
}
