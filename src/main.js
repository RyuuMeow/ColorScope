/**
 * ColorScope — Main Application Entry Point
 */
import { bus } from './utils/EventBus.js';
import { $, $$, showModal, hideModal, createElement } from './utils/DOMUtils.js';
import { rgbToHsl, rgbToHex, perceivedBrightness, colorName } from './core/ColorMath.js';
import { ImageLoader } from './core/ImageLoader.js';
import { CanvasEngine } from './core/CanvasEngine.js';
import { LayerManager } from './core/LayerManager.js';
import { ToolManager } from './tools/ToolManager.js';
import { SelectTool } from './tools/SelectTool.js';
import { MoveTool } from './tools/MoveTool.js';
import { HandTool } from './tools/HandTool.js';
import { ColorPinTool } from './tools/ColorPinTool.js';
import { ComparisonTool } from './tools/ComparisonTool.js';
import { RegionTool } from './tools/RegionTool.js';
import { NoteTool } from './tools/NoteTool.js';
import { FilterTool } from './tools/FilterTool.js';
import { PaletteExtractor } from './analysis/PaletteExtractor.js';
import { HistogramAnalyzer } from './analysis/HistogramAnalyzer.js';
import { ColorStats } from './analysis/ColorStats.js';
import { settingsModal } from './ui/SettingsModal.js';
import { advancedAnalysisModal } from './ui/AdvancedAnalysisModal.js';

class ColorScopeApp {
  constructor() {
    this.imageLoader = new ImageLoader();
    this.canvasEngine = new CanvasEngine();
    this.layerManager = new LayerManager();
    this.canvasEngine.setLayerManager(this.layerManager);

    this.toolManager = new ToolManager();
    this.selectTool = new SelectTool(this.layerManager, this.canvasEngine);
    this.moveTool = new MoveTool(this.layerManager, this.canvasEngine, this.imageLoader);
    this.handTool = new HandTool(this.canvasEngine);
    this.colorPinTool = new ColorPinTool(this.imageLoader, this.canvasEngine, this.layerManager);
    this.comparisonTool = new ComparisonTool(this.imageLoader, this.canvasEngine, this.layerManager);
    this.regionTool = new RegionTool(this.imageLoader, this.canvasEngine, this.layerManager);
    this.noteTool = new NoteTool(this.canvasEngine, this.layerManager);
    this.filterTool = new FilterTool();

    this._currentDataURL = null;
    this._currentFileName = '';
    this._currentHistoryId = null;

    this._initTheme();
    this._initEvents();
    this._initExport();
    this._initPanelTabs();
    this._initContextMenu();
    this._initLayerPanel();
    this._renderHomeGallery();
  }

  // ===== Theme =====
  _initTheme() {
    const saved = localStorage.getItem('colorscope-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    this._updateThemeIcons(saved);

    $('#btn-theme')?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.add('theme-transitioning');
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('colorscope-theme', next);
      this._updateThemeIcons(next);
      setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 350);
    });
  }

  _updateThemeIcons(theme) {
    const moon = $('.icon-moon');
    const sun = $('.icon-sun');
    if (theme === 'dark') { if (moon) moon.style.display = ''; if (sun) sun.style.display = 'none'; }
    else { if (moon) moon.style.display = 'none'; if (sun) sun.style.display = ''; }
  }

  // ===== Events =====
  _initEvents() {
    bus.on('image:loaded', (data) => {
      this._currentDataURL = data.dataURL;
      this._currentFileName = data.fileName;

      const homePage = $('#home-page');
      const app = $('#app');
      homePage.classList.add('hidden');
      app.classList.remove('hidden');

      $('#header-filename').textContent = data.fileName;
      $('#status-size').textContent = `${data.image.width} × ${data.image.height}`;

      this._currentHistoryId = null; // Unbind from previous image so clearAll doesn't wipe its history
      this.layerManager.clearAll(); // Ensure objects don't leak from previous image
      if (data.state) {
        this.layerManager.deserialize(data.state);
      }

      setTimeout(() => this._runAnalysis(data.imageData), 100);
      this._saveToHistory(data);
    });

    bus.on('canvas:mousemove', (pos) => {
      const pixel = this.imageLoader.getPixel(pos.imgX, pos.imgY);
      this._updateHUD(pixel, pos);
      this._updateStatusPos(pos.imgX, pos.imgY);
    });

    bus.on('canvas:status', (status) => {
      $('#status-zoom').textContent = status.zoom + '%';
    });

    bus.on('compare:result-line', ({ start, end, delta, dBright }) => {
      this._renderComparisonInPanel(start, end, delta, dBright);
    });

    bus.on('layers:changed', () => {
      this._renderLayerPanel();
      this.canvasEngine.render();
      this._saveCurrentState();
    });

    bus.on('layers:objects-changed', () => {
      this._updateObjectLists();
      this.canvasEngine.render();
      this._saveCurrentState(); // Persist changes immediately
    });

    $('#btn-back')?.addEventListener('click', () => this._goHome());
    $('#btn-history')?.addEventListener('click', () => this._goHome());
    
    // Settings & Analysis
    $('#btn-analysis')?.addEventListener('click', () => {
      advancedAnalysisModal.show(this.imageLoader);
    });

    $('#btn-settings')?.addEventListener('click', () => {
      settingsModal.show();
    });
    
    bus.on('settings:changed', () => {
      this.canvasEngine.render();
    });
  }

  _goHome() {
    this._saveCurrentState();
    const homePage = $('#home-page');
    const app = $('#app');
    app.classList.add('hidden');
    homePage.classList.remove('hidden');
    this._renderHomeGallery();
  }

  _saveCurrentState() {
    if (!this._currentHistoryId) return;
    const history = this._getHistory();
    const entry = history.find(h => h.id === this._currentHistoryId);
    if (entry) {
      entry.state = this.layerManager.serialize();
      this._setHistory(history);
    }
  }

  _updateHUD(pixel, pos) {
    const hud = $('#color-hud');
    if (!pixel) { hud.classList.add('hidden'); return; }
    hud.classList.remove('hidden');

    const hex = rgbToHex(pixel.r, pixel.g, pixel.b);
    const hsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
    const brightness = perceivedBrightness(pixel.r, pixel.g, pixel.b);

    $('#hud-name').textContent = colorName(hsl.h, hsl.s, hsl.l);
    $('#hud-preview').style.backgroundColor = hex;
    $('#hud-hex').textContent = hex.toUpperCase();
    $('#hud-rgb').textContent = `${pixel.r}, ${pixel.g}, ${pixel.b}`;
    $('#hud-hsl').textContent = `${hsl.h}°, ${hsl.s}%, ${hsl.l}%`;
    $('#hud-brightness').textContent = brightness + '%';

    const offset = 20;
    let x = pos.screenX + offset, y = pos.screenY + offset;
    const hudRect = hud.getBoundingClientRect();
    if (x + hudRect.width > window.innerWidth - 10) x = pos.screenX - hudRect.width - offset;
    if (y + hudRect.height > window.innerHeight - 10) y = pos.screenY - hudRect.height - offset;
    hud.style.left = x + 'px';
    hud.style.top = y + 'px';
  }

  _updateStatusPos(imgX, imgY) {
    const x = Math.floor(imgX), y = Math.floor(imgY);
    if (x >= 0 && y >= 0 && this.imageLoader.imageData && x < this.imageLoader.imageData.width && y < this.imageLoader.imageData.height) {
      $('#status-pos').textContent = `X: ${x}  Y: ${y}`;
    }
  }

  // ===== Analysis =====
  _runAnalysis(imageData) {
    const palette = PaletteExtractor.extract(imageData, 6);
    this._renderPalette(palette);
    const stats = ColorStats.analyze(imageData);
    this._renderStats(stats);
    this._drawHistograms(imageData);
  }

  _drawHistograms(imageData) {
    const brightHist = HistogramAnalyzer.brightnessHistogram(imageData);
    const satHist = HistogramAnalyzer.saturationHistogram(imageData);
    const drawAll = () => {
      const hCanvas = $('#histogram-canvas');
      const sCanvas = $('#sat-histogram-canvas');
      if (!hCanvas || !sCanvas) return;
      const theme = document.documentElement.getAttribute('data-theme');
      const histColor = theme === 'dark' ? '#8b5cf6' : '#6366f1';
      const hRect = hCanvas.parentElement.getBoundingClientRect();
      if (hRect.width > 0) {
        hCanvas.style.width = '100%'; sCanvas.style.width = '100%';
        HistogramAnalyzer.drawHistogram(hCanvas, brightHist, histColor);
        HistogramAnalyzer.drawHistogram(sCanvas, satHist, '#06b6d4');
      } else { setTimeout(drawAll, 200); }
    };
    requestAnimationFrame(() => { drawAll(); setTimeout(drawAll, 300); });
  }

  _renderPalette(palette) {
    const container = $('#palette-swatches');
    if (!container) return;
    container.innerHTML = '';
    for (const color of palette) {
      container.appendChild(createElement('div', { 
        className: 'palette-swatch', 
        style: { backgroundColor: color.hex, cursor: 'pointer' },
        onClick: () => {
          import('./core/ColorMath.js').then(({ rgbToHsv, perceivedBrightness, brightnessLabel }) => {
            import('./ui/ColorDetailsModal.js').then(({ colorDetailsModal }) => {
              const hsv = rgbToHsv(color.r, color.g, color.b);
              const b = perceivedBrightness(color.r, color.g, color.b);
              colorDetailsModal.show({
                r: color.r, g: color.g, b: color.b, hex: color.hex,
                hsl: color.hsl, hsv, brightness: b, brightLabel: brightnessLabel(b),
                imgX: 0, imgY: 0
              });
            });
          });
        }
      }, [
        createElement('span', { className: 'swatch-tooltip', textContent: color.hex.toUpperCase() }),
        createElement('span', { className: 'swatch-pct', textContent: color.percentage + '%' })
      ]));
    }
  }

  _renderStats(stats) {
    $('#stat-cool').style.width = stats.cool + '%';
    $('#stat-cool-val').textContent = stats.cool + '%';
    $('#stat-warm').style.width = stats.warm + '%';
    $('#stat-warm-val').textContent = stats.warm + '%';
    $('#stat-neutral').style.width = stats.neutral + '%';
    $('#stat-neutral-val').textContent = stats.neutral + '%';
  }

  // Obsolete function - now handled directly in _updateObjectLists
  _renderComparisonInPanel() {
    // Replaced by standard list view.
  }

  _initPanelTabs() {
    $$('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.panel-tab').forEach(t => t.classList.remove('active'));
        $$('.panel-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        $(`.panel-content[data-content="${tab.dataset.tab}"]`)?.classList.add('active');
        if (tab.dataset.tab === 'analysis' && this.imageLoader.imageData) {
          setTimeout(() => this._drawHistograms(this.imageLoader.imageData), 50);
        }
      });
    });
  }

  _updateObjectLists() {
    const self = this;

    // Helper: create a delete button that DEFINITELY works
    function makeDeleteBtn(cssClass, objId) {
      const btn = document.createElement('div');
      btn.className = cssClass;
      btn.textContent = '✕';
      btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:20px;height:20px;font-size:12px;line-height:1;cursor:pointer;user-select:none;';
      btn.addEventListener('mousedown', function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        self.layerManager.removeObjectFromAny(objId);
        self.canvasEngine.render();
      }, true); // capture phase
      return btn;
    }

    // Update pin list
    const pinList = $('#pin-list');
    if (pinList) {
      const pins = this.layerManager.getAllObjectsByType('pin');
      if (pins.length === 0) {
        pinList.innerHTML = `<div class="empty-state"><p>尚未放置圖釘</p><p class="hint">使用圖釘工具點擊放置</p></div>`;
      } else {
        pinList.innerHTML = '';
        for (const pin of pins) {
          const item = createElement('div', { className: `pin-item${pin.selected ? ' selected' : ''}` }, [
            createElement('div', { className: 'pin-color-preview', style: { backgroundColor: pin.hex } }),
            createElement('div', { className: 'pin-info' }, [
              createElement('div', { className: 'pin-label', textContent: pin.label }),
              createElement('div', { className: 'pin-hex', textContent: `${pin.hex} · H${pin.hsl.h}° S${pin.hsl.s}% L${pin.hsl.l}%` })
            ])
          ]);
          item.appendChild(makeDeleteBtn('pin-delete', pin.id));
          pinList.appendChild(item);
        }
      }
    }

    // Update note list
    const noteList = $('#note-list');
    if (noteList) {
      const notes = this.layerManager.getAllObjectsByType('note');
      if (notes.length === 0) {
        noteList.innerHTML = `<div class="empty-state"><p>尚未添加筆記</p><p class="hint">使用筆記工具在畫布上點擊</p></div>`;
      } else {
        noteList.innerHTML = '';
        for (const note of notes) {
          const item = createElement('div', { className: 'note-item' }, [
            createElement('div', { className: 'note-color-dot', style: { backgroundColor: note.color } }),
            createElement('div', { className: 'note-text-preview', textContent: note.text || '(空白)' })
          ]);
          item.appendChild(makeDeleteBtn('note-delete', note.id));
          noteList.appendChild(item);
        }
      }
    }

    // Update comparison list
    const compList = $('#comparison-list');
    if (compList) {
      const comps = this.layerManager.getAllObjectsByType('comparison');
      if (comps.length === 0) {
        compList.innerHTML = `<div class="empty-state"><p>尚未建立對比</p><p class="hint">使用對比工具在圖片上拖曳建立</p></div>`;
      } else {
        compList.innerHTML = '';
        for (const comp of comps) {
          const item = createElement('div', { className: `comparison-item${comp.selected ? ' selected' : ''}` }, [
            createElement('div', { className: 'comparison-pair' }, [
              createElement('div', { className: 'comparison-swatch', style: { backgroundColor: comp.start.hex } }),
              createElement('span', { className: 'comparison-arrow', textContent: '⟷' }),
              createElement('div', { className: 'comparison-swatch', style: { backgroundColor: comp.end.hex } })
            ]),
            createElement('div', { className: 'comparison-stats' }, [
              createElement('div', { className: 'comparison-stat' }, [
                createElement('span', { className: 'comparison-stat-label', textContent: '明度差' }),
                createElement('span', { className: 'comparison-stat-value', textContent: comp.dBright, style: { color: comp.dBright > 30 ? '#f43f5e' : '#22c55e' } })
              ]),
              createElement('div', { className: 'comparison-stat' }, [
                createElement('span', { className: 'comparison-stat-label', textContent: '色相差' }),
                createElement('span', { className: 'comparison-stat-value', textContent: `${comp.delta.deltaH}°`, style: { color: comp.delta.deltaH > 60 ? '#8b5cf6' : '#3b82f6' } })
              ])
            ])
          ]);
          // Insert delete button at the top of the item
          item.insertBefore(makeDeleteBtn('comparison-delete', comp.id), item.firstChild);
          compList.appendChild(item);
        }
      }
    }
  }

  // ===== Context Menu =====
  _initContextMenu() {
    const menu = $('#context-menu');
    if (!menu) return;

    bus.on('canvas:contextmenu', (pos) => {
      const items = [];
      const { imgX, imgY } = pos;
      const obj = this.layerManager.getObjectAt(imgX, imgY, this.canvasEngine.scale);

      if (obj) {
        if (obj.type === 'pin') {
          items.push({ label: '編輯標籤', action: 'edit-pin-label', data: { pinId: obj.id } });
          items.push({ label: `複製色碼 ${obj.hex}`, action: 'copy-color', data: { pinId: obj.id } });
          items.push({ divider: true });
          items.push({ label: '刪除圖釘', action: 'delete-obj', data: { objId: obj.id }, danger: true });
        } else if (obj.type === 'note') {
          items.push({ label: '編輯筆記', action: 'edit-note', data: { noteId: obj.id } });
          items.push({ divider: true });
          items.push({ label: '刪除筆記', action: 'delete-obj', data: { objId: obj.id }, danger: true });
        } else if (obj.type === 'comparison') {
          items.push({ label: '刪除對比線', action: 'delete-obj', data: { objId: obj.id }, danger: true });
        } else if (obj.type === 'region') {
          items.push({ label: '刪除區域', action: 'delete-obj', data: { objId: obj.id }, danger: true });
        }
      } else {
        const pixel = this.imageLoader.getPixel(imgX, imgY);
        if (pixel) {
          items.push({ label: '放置圖釘', action: 'add-pin', data: { imgX, imgY, pixel } });
          items.push({ label: '添加筆記', action: 'add-note', data: { imgX, imgY } });
        }
      }

      if (items.length === 0) return;

      menu.innerHTML = '';
      for (const item of items) {
        if (item.divider) {
          menu.appendChild(createElement('div', { className: 'context-menu-divider' }));
        } else {
          const el = createElement('div', {
            className: `context-menu-item${item.danger ? ' danger' : ''}`,
            textContent: item.label
          });
          el.addEventListener('click', () => {
            if (item.action === 'add-pin') {
              this.colorPinTool.addPin(item.data.imgX, item.data.imgY, item.data.pixel);
            } else if (item.action === 'add-note') {
              this.noteTool._createNoteWithEditor(item.data.imgX, item.data.imgY);
            } else if (item.action === 'delete-obj') {
              this.layerManager.removeObjectFromAny(item.data.objId);
              this.canvasEngine.render();
              bus.emit('layers:objects-changed');
            } else {
              bus.emit('contextmenu:action', { action: item.action, data: item.data });
            }
            this._hideContextMenu();
          });
          menu.appendChild(el);
        }
      }

      menu.classList.remove('hidden');
      menu.style.left = pos.screenX + 'px';
      menu.style.top = pos.screenY + 'px';
      requestAnimationFrame(() => {
        const mr = menu.getBoundingClientRect();
        if (mr.right > window.innerWidth) menu.style.left = (pos.screenX - mr.width) + 'px';
        if (mr.bottom > window.innerHeight) menu.style.top = (pos.screenY - mr.height) + 'px';
      });
    });

    window.addEventListener('mousedown', (e) => { if (!menu.contains(e.target)) this._hideContextMenu(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._hideContextMenu(); });
  }

  _hideContextMenu() { $('#context-menu')?.classList.add('hidden'); }

  // ===== Layer Panel =====
  _initLayerPanel() {
    $('#btn-add-layer')?.addEventListener('click', () => {
      this.layerManager.addLayer(`圖層 ${this.layerManager.layers.length + 1}`);
    });
    this._renderLayerPanel();
  }

  _renderLayerPanel() {
    const list = $('#layer-list');
    if (!list) return;
    list.innerHTML = '';

    for (let i = this.layerManager.layers.length - 1; i >= 0; i--) {
      const layer = this.layerManager.layers[i];
      const isActive = layer.id === this.layerManager.activeLayerId;

      const item = createElement('div', { className: `layer-item${isActive ? ' active' : ''}` }, [
        createElement('button', {
          className: `layer-visibility${layer.visible ? ' visible' : ''}`,
          innerHTML: layer.visible ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
          onClick: (e) => { e.stopPropagation(); this.layerManager.toggleLayerVisibility(layer.id); }
        }),
        createElement('span', {
          className: 'layer-name', textContent: layer.name,
          onDblclick: () => this._renameLayerInline(layer)
        }),
        createElement('span', { className: 'layer-count', textContent: `${layer.objects.length}` }),
        createElement('button', {
          className: 'layer-delete',
          innerHTML: '×',
          onClick: (e) => { e.stopPropagation(); this.layerManager.removeLayer(layer.id); }
        })
      ]);

      item.addEventListener('click', () => this.layerManager.setActiveLayer(layer.id));
      list.appendChild(item);
    }
  }

  _renameLayerInline(layer) {
    const nameEl = document.querySelector(`.layer-item.active .layer-name`);
    if (!nameEl) return;
    const input = document.createElement('input');
    input.value = layer.name;
    input.className = 'layer-name-input';
    input.style.cssText = 'width:100%; padding:2px 4px; border:1px solid var(--accent); border-radius:4px; background:var(--bg-elevated); color:var(--text-primary); font-size:12px; outline:none;';
    nameEl.replaceWith(input);
    input.focus(); input.select();
    const save = () => { this.layerManager.renameLayer(layer.id, input.value.trim() || layer.name); };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') this._renderLayerPanel(); });
  }

  // ===== Export =====
  _initExport() {
    $('#btn-export')?.addEventListener('click', () => showModal('export-dialog'));
    $('#export-close')?.addEventListener('click', () => hideModal('export-dialog'));
    $$('.format-btn').forEach(btn => {
      btn.addEventListener('click', () => { $$('.format-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); });
    });
    $('#btn-do-export')?.addEventListener('click', () => this._doExport());
  }

  _doExport() {
    const format = $('.format-btn.active')?.dataset.format || 'png';
    const source = $('#export-source')?.value || 'original';
    const img = this.imageLoader.image;
    const imageData = this.imageLoader.imageData;
    if (!img || !imageData) return;

    const includeCanvas = $('#export-canvas')?.checked;
    const includePalette = $('#export-palette')?.checked;
    const includePins = $('#export-pins')?.checked;
    const includeNotes = $('#export-notes')?.checked;
    const includeStats = $('#export-stats')?.checked;

    // === Step 1: Generate base image pixels ===
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = img.width;
    baseCanvas.height = img.height;
    const baseCtx = baseCanvas.getContext('2d');

    if (source === 'original') {
      baseCtx.drawImage(img, 0, 0);
    } else {
      // Apply filter to raw imageData
      const src = imageData;
      const w = src.width, h = src.height;
      const dst = baseCtx.createImageData(w, h);
      const sd = src.data, dd = dst.data;
      for (let i = 0; i < sd.length; i += 4) {
        const r = sd[i], g = sd[i+1], b = sd[i+2], a = sd[i+3];
        if (source === 'grayscale') {
          const gray = Math.round(0.299*r + 0.587*g + 0.114*b);
          dd[i]=gray; dd[i+1]=gray; dd[i+2]=gray; dd[i+3]=a;
        } else if (source === 'saturation') {
          const max = Math.max(r,g,b), min = Math.min(r,g,b);
          const sat = max === 0 ? 0 : (max-min)/max;
          dd[i]=Math.round(255*Math.min(1,sat*2.5));
          dd[i+1]=Math.round(255*Math.max(0,sat<0.4?sat*2.5:sat>0.7?(1-sat)*3.3:1));
          dd[i+2]=Math.round(255*Math.max(0,1-sat*2));
          dd[i+3]=a;
        } else if (source === 'hue') {
          const max2=Math.max(r,g,b), min2=Math.min(r,g,b), d2=max2-min2;
          let hue=0;
          if(d2>0){
            if(max2===r) hue=((g-b)/d2+(g<b?6:0))/6*360;
            else if(max2===g) hue=((b-r)/d2+2)/6*360;
            else hue=((r-g)/d2+4)/6*360;
          }
          const hs=parseInt($('#hue-start')?.value||0), he=parseInt($('#hue-end')?.value||60);
          const inR = hs<=he ? (hue>=hs&&hue<=he) : (hue>=hs||hue<=he);
          if(!inR || d2<10){
            const gr=Math.round(0.299*r+0.587*g+0.114*b);
            dd[i]=gr;dd[i+1]=gr;dd[i+2]=gr;dd[i+3]=a;
          } else { dd[i]=r;dd[i+1]=g;dd[i+2]=b;dd[i+3]=a; }
        } else {
          dd[i]=r;dd[i+1]=g;dd[i+2]=b;dd[i+3]=a;
        }
      }
      baseCtx.putImageData(dst, 0, 0);
    }

    // === Step 2: Render canvas objects (pins, notes, comparisons, regions) ===
    if (includeCanvas) {
      const objs = this.layerManager.getVisibleObjects();
      const exportScale = this.canvasEngine.scale ? 1 / this.canvasEngine.scale : 1.0;
      for (const obj of objs) {
        obj.render(baseCtx, 1, 0, 0, { width: img.width, height: img.height, exportScale });
      }
    }

    // === Step 3: Calculate extra panels below the image ===
    const panelFont = '13px Inter, Noto Sans TC, sans-serif';
    const panelFontBold = 'bold 13px Inter, Noto Sans TC, sans-serif';
    const panelFontSmall = '11px Inter, Noto Sans TC, sans-serif';
    const panelPad = 20;
    const panelBg = '#1a1a2e';
    const panelText = '#e0e0e0';
    const panelTextDim = '#888';
    const panelW = img.width;

    let extraH = 0;
    const sections = []; // { draw: (ctx, y) => newY }

    // --- Palette strip ---
    if (includePalette) {
      const palette = PaletteExtractor.extract(imageData, 8);
      const stripH = 60;
      const labelH = 22;
      const sectionH = panelPad + stripH + labelH + panelPad;
      sections.push({ height: sectionH, draw: (ctx, y) => {
        ctx.fillStyle = panelBg;
        ctx.fillRect(0, y, panelW, sectionH);
        // Title
        ctx.font = panelFontBold;
        ctx.fillStyle = panelText;
        ctx.fillText('主色調色板 (Dominant Palette)', panelPad, y + panelPad + 12);
        const swatchY = y + panelPad + 20;
        const gap = 4;
        const swatchW = (panelW - panelPad * 2 - gap * (palette.length - 1)) / palette.length;
        palette.forEach((c, i) => {
          const sx = panelPad + i * (swatchW + gap);
          // Swatch
          ctx.fillStyle = c.hex;
          ctx.beginPath();
          ctx.roundRect(sx, swatchY, swatchW, stripH - 8, 6);
          ctx.fill();
          // Label
          ctx.font = panelFontSmall;
          ctx.fillStyle = panelText;
          ctx.textAlign = 'center';
          ctx.fillText(`${c.hex.toUpperCase()}`, sx + swatchW / 2, swatchY + stripH + 6);
          ctx.fillStyle = panelTextDim;
          ctx.fillText(`${c.percentage}%`, sx + swatchW / 2, swatchY + stripH + 18);
          ctx.textAlign = 'left';
        });
      }});
      extraH += sectionH;
    }

    // --- Pin info table ---
    if (includePins) {
      const pins = this.layerManager.getAllObjectsByType('pin');
      if (pins.length > 0) {
        const rowH = 24;
        const headerH = 30;
        const sectionH = panelPad + headerH + pins.length * rowH + panelPad;
        sections.push({ height: sectionH, draw: (ctx, y) => {
          ctx.fillStyle = panelBg;
          ctx.fillRect(0, y, panelW, sectionH);
          ctx.font = panelFontBold;
          ctx.fillStyle = panelText;
          ctx.fillText('圖釘資訊表 (Pin Data)', panelPad, y + panelPad + 12);
          // Header
          const tableY = y + panelPad + 20;
          ctx.font = panelFontSmall;
          ctx.fillStyle = panelTextDim;
          ctx.fillText('#', panelPad, tableY + 14);
          ctx.fillText('標籤', panelPad + 30, tableY + 14);
          ctx.fillText('HEX', panelPad + 180, tableY + 14);
          ctx.fillText('HSL', panelPad + 280, tableY + 14);
          ctx.fillText('座標', panelPad + 430, tableY + 14);
          // Divider
          ctx.strokeStyle = '#333';
          ctx.beginPath(); ctx.moveTo(panelPad, tableY + headerH - 4); ctx.lineTo(panelW - panelPad, tableY + headerH - 4); ctx.stroke();
          // Rows
          pins.forEach((pin, i) => {
            const ry = tableY + headerH + i * rowH;
            ctx.font = panelFontSmall;
            ctx.fillStyle = panelText;
            ctx.fillText(`${i + 1}`, panelPad, ry + 14);
            // Color dot
            ctx.fillStyle = pin.hex;
            ctx.beginPath(); ctx.arc(panelPad + 22, ry + 10, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = panelText;
            ctx.fillText(pin.label || '—', panelPad + 30, ry + 14);
            ctx.fillStyle = '#a0a0ff';
            ctx.fillText(pin.hex?.toUpperCase() || '', panelPad + 180, ry + 14);
            ctx.fillStyle = panelTextDim;
            ctx.fillText(`H${pin.hsl?.h}° S${pin.hsl?.s}% L${pin.hsl?.l}%`, panelPad + 280, ry + 14);
            ctx.fillText(`(${Math.round(pin.x)}, ${Math.round(pin.y)})`, panelPad + 430, ry + 14);
          });
        }});
        extraH += panelPad + headerH + pins.length * rowH + panelPad;
      }
    }

    // --- Notes ---
    if (includeNotes) {
      const notes = this.layerManager.getAllObjectsByType('note');
      if (notes.length > 0) {
        const lineH = 20;
        const sectionH = panelPad + 20 + notes.length * lineH + panelPad;
        sections.push({ height: sectionH, draw: (ctx, y) => {
          ctx.fillStyle = panelBg;
          ctx.fillRect(0, y, panelW, sectionH);
          ctx.font = panelFontBold;
          ctx.fillStyle = panelText;
          ctx.fillText('筆記內容 (Notes)', panelPad, y + panelPad + 12);
          notes.forEach((note, i) => {
            const ny = y + panelPad + 24 + i * lineH;
            ctx.fillStyle = note.color || '#fbbf24';
            ctx.beginPath(); ctx.arc(panelPad + 4, ny + 4, 4, 0, Math.PI * 2); ctx.fill();
            ctx.font = panelFontSmall;
            ctx.fillStyle = panelText;
            const txt = (note.text || '(空白)').substring(0, 80);
            ctx.fillText(`${i + 1}. ${txt}`, panelPad + 14, ny + 8);
          });
        }});
        extraH += sectionH;
      }
    }

    // --- Stats ---
    if (includeStats) {
      const stats = ColorStats.analyze(imageData);
      const sectionH = panelPad + 80 + panelPad;
      sections.push({ height: sectionH, draw: (ctx, y) => {
        ctx.fillStyle = panelBg;
        ctx.fillRect(0, y, panelW, sectionH);
        ctx.font = panelFontBold;
        ctx.fillStyle = panelText;
        ctx.fillText('色彩統計 (Color Statistics)', panelPad, y + panelPad + 12);
        const barY = y + panelPad + 28;
        const barH = 14;
        const barW = panelW - panelPad * 2;
        // Cool
        const drawBar = (label, pct, color, offsetY) => {
          ctx.font = panelFontSmall;
          ctx.fillStyle = panelTextDim;
          ctx.fillText(label, panelPad, barY + offsetY + 10);
          ctx.fillStyle = '#2a2a3e';
          ctx.beginPath(); ctx.roundRect(panelPad + 70, barY + offsetY, barW - 120, barH, 4); ctx.fill();
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.roundRect(panelPad + 70, barY + offsetY, (barW - 120) * pct / 100, barH, 4); ctx.fill();
          ctx.fillStyle = panelText;
          ctx.fillText(`${pct}%`, panelW - panelPad - 40, barY + offsetY + 10);
        };
        drawBar('冷色', stats.cool, '#3b82f6', 0);
        drawBar('暖色', stats.warm, '#f59e0b', 20);
        drawBar('中性', stats.neutral, '#6b7280', 40);
      }});
      extraH += sectionH;
    }

    // === Step 4: Full analysis composite (special source) ===
    if (source === 'analysis') {
      // For analysis mode, compose a 2x2 grid + panels
      const halfW = Math.ceil(img.width / 2);
      const halfH = Math.ceil(img.height / 2);
      const gridW = halfW * 2;
      const gridH = halfH * 2;
      const labelBarH = 24;

      const ec = document.createElement('canvas');
      ec.width = gridW;
      ec.height = gridH + labelBarH * 2 + extraH;
      const ctx = ec.getContext('2d');

      // Draw 4 quadrants
      const drawQuad = (srcCanvas, x, y, label) => {
        ctx.drawImage(srcCanvas, x, y, halfW, halfH);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y, halfW, labelBarH);
        ctx.font = panelFontBold;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + halfW / 2, y + 16);
        ctx.textAlign = 'left';
      };

      // Original
      const origC = document.createElement('canvas');
      origC.width = img.width; origC.height = img.height;
      origC.getContext('2d').drawImage(img, 0, 0);
      drawQuad(origC, 0, 0, '原圖 Original');

      // Grayscale
      const grayC = this._applyFilterToCanvas(imageData, 'grayscale');
      drawQuad(grayC, halfW, 0, '灰階 Grayscale');

      // Saturation
      const satC = this._applyFilterToCanvas(imageData, 'saturation');
      drawQuad(satC, 0, halfH, '飽和度 Saturation');

      // Hue isolation
      const hueC = this._applyFilterToCanvas(imageData, 'hue');
      drawQuad(hueC, halfW, halfH, '色相隔離 Hue Isolation');

      // Panels
      let panelY = gridH;
      for (const sec of sections) {
        sec.draw(ctx, panelY);
        panelY += sec.height;
      }

      const link = document.createElement('a');
      link.download = `colorscope-analysis-${this._currentFileName || 'export'}.${format}`;
      link.href = ec.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
      link.click();
      hideModal('export-dialog');
      return;
    }

    // === Step 5: Assemble final canvas (non-analysis) ===
    const ec = document.createElement('canvas');
    ec.width = img.width;
    ec.height = img.height + extraH;
    const ctx = ec.getContext('2d');
    ctx.drawImage(baseCanvas, 0, 0);

    let panelY = img.height;
    for (const sec of sections) {
      sec.draw(ctx, panelY);
      panelY += sec.height;
    }

    const link = document.createElement('a');
    link.download = `colorscope-${this._currentFileName || 'export'}.${format}`;
    link.href = ec.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
    link.click();
    hideModal('export-dialog');
  }

  /** Helper: apply a filter type to imageData and return a canvas */
  _applyFilterToCanvas(imageData, filterType) {
    const w = imageData.width, h = imageData.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tctx = c.getContext('2d');
    const dst = tctx.createImageData(w, h);
    const sd = imageData.data, dd = dst.data;
    for (let i = 0; i < sd.length; i += 4) {
      const r = sd[i], g = sd[i+1], b = sd[i+2], a = sd[i+3];
      if (filterType === 'grayscale') {
        const gray = Math.round(0.299*r + 0.587*g + 0.114*b);
        dd[i]=gray; dd[i+1]=gray; dd[i+2]=gray; dd[i+3]=a;
      } else if (filterType === 'saturation') {
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        const sat = max === 0 ? 0 : (max-min)/max;
        dd[i]=Math.round(255*Math.min(1,sat*2.5));
        dd[i+1]=Math.round(255*Math.max(0,sat<0.4?sat*2.5:sat>0.7?(1-sat)*3.3:1));
        dd[i+2]=Math.round(255*Math.max(0,1-sat*2));
        dd[i+3]=a;
      } else if (filterType === 'hue') {
        const max2=Math.max(r,g,b), min2=Math.min(r,g,b), d2=max2-min2;
        let hue=0;
        if(d2>0){
          if(max2===r) hue=((g-b)/d2+(g<b?6:0))/6*360;
          else if(max2===g) hue=((b-r)/d2+2)/6*360;
          else hue=((r-g)/d2+4)/6*360;
        }
        const hs=parseInt($('#hue-start')?.value||0), he=parseInt($('#hue-end')?.value||60);
        const inR = hs<=he ? (hue>=hs&&hue<=he) : (hue>=hs||hue<=he);
        if(!inR || d2<10){
          const gr=Math.round(0.299*r+0.587*g+0.114*b);
          dd[i]=gr;dd[i+1]=gr;dd[i+2]=gr;dd[i+3]=a;
        } else { dd[i]=r;dd[i+1]=g;dd[i+2]=b;dd[i+3]=a; }
      } else {
        dd[i]=r;dd[i+1]=g;dd[i+2]=b;dd[i+3]=a;
      }
    }
    tctx.putImageData(dst, 0, 0);
    return c;
  }

  // ===== History =====
  _saveToHistory(data) {
    try {
      const thumbCanvas = document.createElement('canvas');
      const maxThumb = 300;
      const ratio = Math.min(maxThumb / data.image.width, maxThumb / data.image.height);
      thumbCanvas.width = data.image.width * ratio;
      thumbCanvas.height = data.image.height * ratio;
      thumbCanvas.getContext('2d').drawImage(data.image, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.6);

      const history = this._getHistory();
      const existing = history.find(h => h.fileName === data.fileName);
      const id = existing?.id || Date.now().toString();

      const entry = {
        id, fileName: data.fileName, thumbnail,
        dataURL: data.dataURL,
        date: new Date().toLocaleDateString('zh-TW'),
        timestamp: Date.now(),
        state: existing?.state || null
      };

      const idx = history.findIndex(h => h.id === id);
      if (idx >= 0) history[idx] = entry;
      else history.unshift(entry);
      if (history.length > 15) history.pop();
      this._currentHistoryId = id;

      try {
        localStorage.setItem('colorscope-history', JSON.stringify(history));
      } catch (e) {
        history.slice(3).forEach(h => { h.dataURL = ''; });
        try { localStorage.setItem('colorscope-history', JSON.stringify(history)); } catch {}
      }
    } catch (e) { console.warn('Could not save to history:', e); }
  }

  _getHistory() {
    try { return JSON.parse(localStorage.getItem('colorscope-history') || '[]'); }
    catch { return []; }
  }

  _setHistory(history) {
    try { localStorage.setItem('colorscope-history', JSON.stringify(history)); } catch {}
  }

  _renderHomeGallery() {
    const history = this._getHistory();
    const grid = $('#gallery-grid');
    const section = $('#home-gallery');
    if (!grid) return;

    if (history.length === 0) { if (section) section.style.display = 'none'; return; }
    if (section) section.style.display = '';
    grid.innerHTML = '';

    for (const entry of history) {
      const item = createElement('div', { className: 'gallery-card' }, [
        createElement('div', { className: 'gallery-card-thumb' }, [
          createElement('img', { src: entry.thumbnail, alt: entry.fileName }),
          createElement('button', {
            className: 'gallery-card-delete', innerHTML: '×',
            onClick: (e) => { e.stopPropagation(); this._deleteHistoryEntry(entry.id); }
          })
        ]),
        createElement('div', { className: 'gallery-card-info' }, [
          createElement('div', { className: 'gallery-card-name', textContent: entry.fileName }),
          createElement('div', { className: 'gallery-card-meta', textContent: entry.date })
        ])
      ]);
      item.addEventListener('click', () => {
        if (entry.dataURL) {
          this.imageLoader.fileName = entry.fileName;
          this.imageLoader.loadFromDataURL(entry.dataURL, entry.state);
        }
      });
      grid.appendChild(item);
    }
  }

  _deleteHistoryEntry(id) {
    this._setHistory(this._getHistory().filter(h => h.id !== id));
    this._renderHomeGallery();
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new ColorScopeApp(); });
