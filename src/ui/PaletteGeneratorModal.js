import { $, $$, createElement, showModal, hideModal } from '../utils/DOMUtils.js';
import { PaletteExtractor } from '../analysis/PaletteExtractor.js';
import { rgbToHex, rgbToHsl, rgbToHsv, perceivedBrightness, brightnessLabel } from '../core/ColorMath.js';
import { colorDetailsModal } from './ColorDetailsModal.js';

export class PaletteGeneratorModal {
  constructor() {
    this._initialized = false;
    this._history = JSON.parse(localStorage.getItem('colorscope-palette-history')) || [];
    this.currentPalette = null;
    this.imageLoader = null;
  }

  show(imageLoader) {
    this.imageLoader = imageLoader;
    if (!this._initialized) {
      this._initDOM();
      this._bindEvents();
      this._initialized = true;
    }
    
    // Check if we need to show a default state or if image is loaded
    if (!this.currentPalette && imageLoader && imageLoader.imageData) {
      this._generatePalette(5);
    } else {
      this._renderPreview();
    }
    
    this._renderHistory();
    showModal('palette-generator-modal');
  }

  _initDOM() {
    const html = `
      <div id="palette-generator-modal" class="modal-overlay hidden">
        <div class="modal palette-gen-modal" style="width: 600px;">
          <div class="modal-header">
            <h2>色版生成器 (Palette Generator)</h2>
            <button class="modal-close" id="palette-gen-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="palette-gen-controls" style="display:flex; align-items:center; gap:16px; margin-bottom: 20px;">
              <label style="flex:1;">
                <span>顏色數量 (Colors): <span id="palette-gen-count-val">5</span></span>
                <input type="range" id="palette-gen-count" min="3" max="12" value="5" style="width:100%;">
              </label>
              <button class="btn btn-primary" id="btn-gen-palette" style="align-self:flex-end;">分析生成</button>
            </div>
            
            <div class="palette-gen-preview" id="palette-gen-preview" style="height: 120px; display:flex; border-radius:8px; overflow:hidden; background:var(--bg-elevated); margin-bottom: 16px;">
               <!-- Swatches rendered here -->
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
              <button class="btn btn-secondary" id="btn-export-palette">匯出長條色版 (PNG)</button>
            </div>

            <div class="palette-history">
              <h3 style="font-size: 14px; margin-bottom: 12px; color:var(--text-secondary);">生成歷史 (History)</h3>
              <div id="palette-history-list" style="display:flex; flex-direction:column; gap:8px; max-height:200px; overflow-y:auto; padding-right:8px;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  _bindEvents() {
    $('#palette-gen-close').addEventListener('click', () => hideModal('palette-generator-modal'));
    
    const countSlider = $('#palette-gen-count');
    const countVal = $('#palette-gen-count-val');
    countSlider.addEventListener('input', () => {
      countVal.textContent = countSlider.value;
    });

    $('#btn-gen-palette').addEventListener('click', () => {
      this._generatePalette(parseInt(countSlider.value, 10));
    });

    $('#btn-export-palette').addEventListener('click', () => {
      this._exportCurrentPalette();
    });
  }

  _generatePalette(count) {
    if (!this.imageLoader || !this.imageLoader.imageData) {
      alert('請先載入圖片！');
      return;
    }

    try {
      this.currentPalette = PaletteExtractor.extract(this.imageLoader.imageData, count);
      this._renderPreview();
      this._addToHistory(this.currentPalette);
    } catch (err) {
      console.error(err);
      alert('生成失敗，圖片可能太大或有誤。');
    }
  }

  _renderPreview(palette = this.currentPalette) {
    const container = $('#palette-gen-preview');
    if (!container) return;
    container.innerHTML = '';
    
    if (!palette || palette.length === 0) {
      container.innerHTML = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary);">尚無色版</div>';
      return;
    }

    palette.forEach(color => {
      const swatch = createElement('div', {
        style: {
          flex: color.percentage || 1,
          backgroundColor: color.hex,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: '12px',
          color: color.hsl.l > 60 ? '#1a1a2e' : '#ffffff',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          fontWeight: 'bold',
          transition: 'flex 0.3s ease'
        },
        title: '雙擊檢視色彩詳情',
        onDblclick: (e) => {
          e.stopPropagation();
          this._openColorDetails(color);
        },
        innerHTML: `<span>${color.percentage ? color.percentage + '%' : ''}</span><span style="font-size:10px; opacity:0.8;">${color.hex.toUpperCase()}</span>`
      });
      container.appendChild(swatch);
    });
  }

  _addToHistory(palette) {
    // Only keeping the hex codes and percentages to save space
    const stripped = palette.map(p => ({ hex: p.hex, percentage: p.percentage, hsl: p.hsl }));
    this._history.unshift({
      id: Date.now().toString(),
      colors: stripped,
      date: new Date().toLocaleDateString()
    });
    
    // Keep max 20
    if (this._history.length > 20) this._history.pop();
    
    localStorage.setItem('colorscope-palette-history', JSON.stringify(this._history));
    this._renderHistory();
  }

  _renderHistory() {
    const list = $('#palette-history-list');
    if (!list) return;
    list.innerHTML = '';

    if (this._history.length === 0) {
      list.innerHTML = '<div style="color:var(--text-tertiary); font-size:12px;">無歷史紀錄</div>';
      return;
    }

    this._history.forEach(entry => {
      const row = createElement('div', {
        style: {
          display: 'flex',
          height: '40px',
          borderRadius: '4px',
          overflow: 'hidden',
          cursor: 'pointer',
          border: '1px solid var(--border-subtle)'
        },
        onClick: () => {
          this.currentPalette = entry.colors;
          this._renderPreview();
        }
      });
      
      entry.colors.forEach(c => {
        row.appendChild(createElement('div', {
          style: {
            flex: c.percentage || 1,
            backgroundColor: c.hex
          },
          title: '雙擊檢視色彩詳情',
          onDblclick: (e) => {
            e.stopPropagation();
            this._openColorDetails(c);
          }
        }));
      });
      list.appendChild(row);
    });
  }

  _openColorDetails(color) {
    if (!color?.hex) return;
    const rgb = this._hexToRgb(color.hex);
    if (!rgb) return;

    const hsl = color.hsl || rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const brightness = perceivedBrightness(rgb.r, rgb.g, rgb.b);

    colorDetailsModal.show({
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      hex: color.hex,
      hsl,
      hsv,
      brightness,
      brightLabel: brightnessLabel(brightness),
      imgX: 0,
      imgY: 0
    });
  }

  _hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    const value = hex.trim().replace('#', '');
    const normalized = value.length === 3
      ? value.split('').map((ch) => ch + ch).join('')
      : value;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16)
    };
  }

  _exportCurrentPalette() {
    if (!this.currentPalette) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    
    let currentX = 0;
    this.currentPalette.forEach(c => {
      const w = canvas.width * ((c.percentage || (100 / this.currentPalette.length)) / 100);
      ctx.fillStyle = c.hex;
      ctx.fillRect(currentX, 0, w, canvas.height);
      
      // Text
      ctx.fillStyle = c.hsl.l > 60 ? '#1a1a2e' : '#ffffff';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.hex.toUpperCase(), currentX + w / 2, canvas.height - 40);
      if (c.percentage) {
        ctx.font = '16px sans-serif';
        ctx.fillText(c.percentage + '%', currentX + w / 2, canvas.height - 15);
      }
      
      currentX += w;
    });

    const link = document.createElement('a');
    link.download = `palette-export-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}

export const paletteGeneratorModal = new PaletteGeneratorModal();
