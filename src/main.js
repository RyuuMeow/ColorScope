/**
 * ColorScope — Main Application Entry Point
 */
import { bus } from './utils/EventBus.js';
import { $, $$, showModal, hideModal, createElement } from './utils/DOMUtils.js';
import { rgbToHsl, rgbToHex, rgbToHsv, perceivedBrightness, colorName, saturationHeatColor, hslToHex } from './core/ColorMath.js';
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
import { BrushTool } from './tools/BrushTool.js';
import { FilterTool } from './tools/FilterTool.js';
import { HarmonyTool } from './tools/HarmonyTool.js';
import { PaletteExtractor } from './analysis/PaletteExtractor.js';
import { HistogramAnalyzer } from './analysis/HistogramAnalyzer.js';
import { ColorStats } from './analysis/ColorStats.js';
import { settingsModal } from './ui/SettingsModal.js';
import { advancedAnalysisModal } from './ui/AdvancedAnalysisModal.js';
import { PalettePage } from './ui/PalettePage.js';

class ColorScopeApp {
  constructor() {
    this.imageLoader = new ImageLoader();
    this.canvasEngine = new CanvasEngine();
    this.imageLoader.canvasEngine = this.canvasEngine;
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
    this.brushTool = new BrushTool(this.canvasEngine, this.layerManager, (tool) => this._getBrushSettings(tool));
    this.filterTool = new FilterTool();
    this.harmonyTool = new HarmonyTool(this.imageLoader, this.canvasEngine);
    this.palettePage = new PalettePage(this);

    this._currentDataURL = null;
    this._currentFileName = '';
    this._currentHistoryId = null;
    this._propertyPanelState = { type: 'empty' };
    this._filterSettings = this._createDefaultFilterSettings();
    this._brushSettings = this._createDefaultBrushSettings();
    this._undoStack = [];
    this._redoStack = [];
    this._historyCheckpointTimer = null;
    this._isApplyingHistoryState = false;

    this._initTheme();
    this._initEvents();
    this._initExport();
    this._initPanelTabs();
    this._initPanelResize();
    this._initContextMenu();
    this._initLayerPanel();
    this._renderHomeGallery();
    this._updateHistoryButtons();
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

  _createDefaultFilterSettings() {
    return {
      hue: { start: 0, end: 60 },
      analogous: { baseHue: 0, tol: 30 },
      complementary: { baseHue: 0, tol: 30 }
    };
  }

  _createDefaultBrushSettings() {
    return {
      brush: {
        h: 12,
        s: 90,
        l: 58,
        size: 24,
        opacity: 92,
        flow: 82,
        hardness: 76,
        pressureSize: true,
        pressureOpacity: false
      },
      eraser: {
        size: 30,
        opacity: 100,
        flow: 100,
        hardness: 92,
        pressureSize: true,
        pressureOpacity: false
      }
    };
  }

  _sanitizeBrushSettings(raw) {
    const defaults = this._createDefaultBrushSettings();
    if (!raw || typeof raw !== 'object') return defaults;

    const toNumber = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    return {
      brush: {
        h: Math.max(0, Math.min(360, Math.round(toNumber(raw.brush?.h, defaults.brush.h)))),
        s: Math.max(0, Math.min(100, Math.round(toNumber(raw.brush?.s, defaults.brush.s)))),
        l: Math.max(0, Math.min(100, Math.round(toNumber(raw.brush?.l, defaults.brush.l)))),
        size: Math.max(1, Math.min(240, toNumber(raw.brush?.size, defaults.brush.size))),
        opacity: Math.max(1, Math.min(100, Math.round(toNumber(raw.brush?.opacity, defaults.brush.opacity)))),
        flow: Math.max(1, Math.min(100, Math.round(toNumber(raw.brush?.flow, defaults.brush.flow)))),
        hardness: Math.max(1, Math.min(100, Math.round(toNumber(raw.brush?.hardness, defaults.brush.hardness)))),
        pressureSize: raw.brush?.pressureSize ?? defaults.brush.pressureSize,
        pressureOpacity: raw.brush?.pressureOpacity ?? defaults.brush.pressureOpacity
      },
      eraser: {
        size: Math.max(1, Math.min(240, toNumber(raw.eraser?.size, defaults.eraser.size))),
        opacity: Math.max(1, Math.min(100, Math.round(toNumber(raw.eraser?.opacity, defaults.eraser.opacity)))),
        flow: Math.max(1, Math.min(100, Math.round(toNumber(raw.eraser?.flow, defaults.eraser.flow)))),
        hardness: Math.max(1, Math.min(100, Math.round(toNumber(raw.eraser?.hardness, defaults.eraser.hardness)))),
        pressureSize: raw.eraser?.pressureSize ?? defaults.eraser.pressureSize,
        pressureOpacity: raw.eraser?.pressureOpacity ?? defaults.eraser.pressureOpacity
      }
    };
  }

  _getBrushSettings(tool = 'brush') {
    const settings = this._brushSettings?.[tool] || this._brushSettings?.brush || this._createDefaultBrushSettings().brush;
    if (tool === 'eraser') {
      return {
        ...settings,
        color: '#000000'
      };
    }
    return {
      ...settings,
      color: hslToHex(settings.h, settings.s, settings.l)
    };
  }

  _cloneHistorySnapshot(snapshot) {
    return JSON.parse(JSON.stringify(snapshot));
  }

  _createHistorySnapshot() {
    return this._cloneHistorySnapshot(this._captureCanvasState());
  }

  _snapshotKey(snapshot) {
    return JSON.stringify(snapshot);
  }

  _resetUndoHistory() {
    const snapshot = this._createHistorySnapshot();
    this._undoStack = [snapshot];
    this._redoStack = [];
    this._updateHistoryButtons();
  }

  _queueHistoryCheckpoint(immediate = false) {
    if (this._isApplyingHistoryState) return;
    if (immediate) {
      if (this._historyCheckpointTimer) {
        clearTimeout(this._historyCheckpointTimer);
        this._historyCheckpointTimer = null;
      }
      this._commitHistoryCheckpoint();
      return;
    }

    if (this._historyCheckpointTimer) clearTimeout(this._historyCheckpointTimer);
    this._historyCheckpointTimer = setTimeout(() => {
      this._historyCheckpointTimer = null;
      this._commitHistoryCheckpoint();
    }, 180);
  }

  _commitHistoryCheckpoint() {
    if (this._isApplyingHistoryState) return;
    const snapshot = this._createHistorySnapshot();
    const key = this._snapshotKey(snapshot);
    const last = this._undoStack[this._undoStack.length - 1];
    if (last && this._snapshotKey(last) === key) {
      this._updateHistoryButtons();
      return;
    }

    this._undoStack.push(snapshot);
    if (this._undoStack.length > 60) this._undoStack.shift();
    this._redoStack = [];
    this._updateHistoryButtons();
  }

  _updateHistoryButtons() {
    const undoBtn = $('#btn-undo');
    const redoBtn = $('#btn-redo');
    if (undoBtn) undoBtn.disabled = this._undoStack.length <= 1;
    if (redoBtn) redoBtn.disabled = this._redoStack.length === 0;
  }

  _applyFilterState(filterName) {
    const current = this._getActiveFilterName();
    if (!filterName) {
      if (current) this.toolManager.toggleFilter(current);
      return;
    }
    if (current && current !== filterName) {
      this.toolManager.toggleFilter(current);
    }
    if (this._getActiveFilterName() !== filterName) {
      this.toolManager.toggleFilter(filterName);
    } else if (filterName === 'hue' || filterName === 'analogous' || filterName === 'complementary') {
      bus.emit('filter:show-props', { filterName });
    }
  }

  _restoreHistorySnapshot(snapshot) {
    if (!snapshot) return;
    this._isApplyingHistoryState = true;
    if (this._historyCheckpointTimer) {
      clearTimeout(this._historyCheckpointTimer);
      this._historyCheckpointTimer = null;
    }

    this._restoreCanvasState(snapshot, { deferFilter: false });
    this.canvasEngine.render();
    this._saveCurrentState();
    this._updateObjectLists();
    this._renderLayerPanel();
    this._queueAnalysisUpdate();
    this._isApplyingHistoryState = false;
    this._updateHistoryButtons();
  }

  _undo() {
    if (this._undoStack.length <= 1) return;
    const current = this._createHistorySnapshot();
    const currentKey = this._snapshotKey(current);
    const topKey = this._snapshotKey(this._undoStack[this._undoStack.length - 1]);

    if (currentKey === topKey) {
      const snapshot = this._undoStack.pop();
      this._redoStack.push(snapshot);
    } else {
      this._redoStack.push(current);
    }

    const previous = this._undoStack[this._undoStack.length - 1];
    this._restoreHistorySnapshot(this._cloneHistorySnapshot(previous));
  }

  _redo() {
    if (this._redoStack.length === 0) return;
    const snapshot = this._redoStack.pop();
    const current = this._createHistorySnapshot();
    const currentKey = this._snapshotKey(current);
    const top = this._undoStack[this._undoStack.length - 1];
    if (!top || this._snapshotKey(top) !== currentKey) {
      this._undoStack.push(current);
    }
    this._undoStack.push(this._cloneHistorySnapshot(snapshot));
    this._restoreHistorySnapshot(this._cloneHistorySnapshot(snapshot));
  }

  _sanitizeFilterSettings(raw) {
    const defaults = this._createDefaultFilterSettings();
    if (!raw || typeof raw !== 'object') return defaults;

    const toInt = (v, fallback) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : fallback;
    };

    return {
      hue: {
        start: Math.max(0, Math.min(360, toInt(raw.hue?.start, defaults.hue.start))),
        end: Math.max(0, Math.min(360, toInt(raw.hue?.end, defaults.hue.end)))
      },
      analogous: {
        baseHue: Math.max(0, Math.min(360, toInt(raw.analogous?.baseHue, defaults.analogous.baseHue))),
        tol: Math.max(5, Math.min(90, toInt(raw.analogous?.tol, defaults.analogous.tol)))
      },
      complementary: {
        baseHue: Math.max(0, Math.min(360, toInt(raw.complementary?.baseHue, defaults.complementary.baseHue))),
        tol: Math.max(5, Math.min(90, toInt(raw.complementary?.tol, defaults.complementary.tol)))
      }
    };
  }

  _getActiveFilterName() {
    return this.toolManager?.activeFilters?.size ? [...this.toolManager.activeFilters][0] : null;
  }

  _getFilterRange(filterName) {
    if (filterName === 'hue') {
      const { start, end } = this._filterSettings.hue;
      return { hueStart: start, hueEnd: end };
    }
    if (filterName === 'analogous' || filterName === 'complementary') {
      const cfg = this._filterSettings[filterName];
      const center = filterName === 'complementary' ? (cfg.baseHue + 180) % 360 : cfg.baseHue;
      return {
        hueStart: (center - cfg.tol + 360) % 360,
        hueEnd: (center + cfg.tol) % 360
      };
    }
    return { hueStart: 0, hueEnd: 60 };
  }

  _captureCanvasState() {
    return {
      layerState: this.layerManager.serialize(),
      filterSettings: this._sanitizeFilterSettings(this._filterSettings),
      brushSettings: this._sanitizeBrushSettings(this._brushSettings),
      activeFilter: this._getActiveFilterName()
    };
  }

  _restoreCanvasState(savedState, options = {}) {
    const { deferFilter = true } = options;
    const layerState = savedState?.layerState || savedState;
    if (layerState?.layers) {
      this.layerManager.deserialize(layerState);
    }

    this._filterSettings = this._sanitizeFilterSettings(savedState?.filterSettings);
    this._brushSettings = this._sanitizeBrushSettings(savedState?.brushSettings);

    const savedFilter = savedState?.activeFilter;
    if (deferFilter) {
      requestAnimationFrame(() => {
        this._applyFilterState(savedFilter || null);
      });
    } else {
      this._applyFilterState(savedFilter || null);
    }
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

      // Reset filters and property panel on new image
      this.toolManager.activeFilters.forEach(f => {
        $(`.tool-btn[data-filter="${f}"]`)?.classList.remove('filter-active');
      });
      this.toolManager.activeFilters.clear();
      this._clearPropertyPanel();
      this._updateFilterLegend(null);

      this._currentHistoryId = null;
      this.layerManager.clearAll();
      this._filterSettings = this._createDefaultFilterSettings();
      this._brushSettings = this._createDefaultBrushSettings();
      if (data.state) {
        this._restoreCanvasState(data.state);
      }
      this._resetUndoHistory();

      setTimeout(() => this._runAnalysis(data.imageData), 100);
      this._saveToHistory(data);
    });

    bus.on('canvas:mousemove', (pos) => {
      const displayPixel = this.imageLoader.getPixel(pos.imgX, pos.imgY, { includeActiveFilter: true });
      const metricPixel = this.canvasEngine._activeFilter === 'saturation'
        ? this.imageLoader.getPixel(pos.imgX, pos.imgY, { includeActiveFilter: false })
        : displayPixel;

      this._updateHUD(displayPixel, pos, metricPixel);
      this._updateStatusPos(pos.imgX, pos.imgY);
      this._updateFilterLegendArrow(displayPixel, metricPixel);
    });

    bus.on('filter:apply', (filter) => {
      this._updateFilterLegend(filter.type);
      this._saveCurrentState();
      this._queueHistoryCheckpoint();
    });
    bus.on('filter:clear', () => {
      this._updateFilterLegend(null);
      this._saveCurrentState();
      this._queueHistoryCheckpoint();
    });
    
    // Filter property panel
    bus.on('filter:show-props', ({ filterName }) => this._renderFilterProps(filterName));
    bus.on('filter:props-clear', () => this._clearPropertyPanel());
    bus.on('tool:changed', ({ tool }) => {
      if (tool === 'brush' || tool === 'eraser') {
        this._renderBrushProps(tool);
        return;
      }
      if (this._propertyPanelState.type === 'brush') {
        this._syncPropertyPanelWithActiveLayer();
      }
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
      this._queueAnalysisUpdate();
      this._queueHistoryCheckpoint(true);
    });

    bus.on('layers:properties-changed', () => {
      this.canvasEngine.render();
      this._saveCurrentState();
      this._queueAnalysisUpdate();
      this._queueHistoryCheckpoint();
    });

    bus.on('layers:objects-changed', () => {
      this._updateObjectLists();
      this.canvasEngine.render();
      this._saveCurrentState();
      this._queueHistoryCheckpoint(true);
    });

    $('#btn-back')?.addEventListener('click', () => this._goHome());
    $('#btn-history')?.addEventListener('click', () => this._goHome());
    
    $('#btn-analysis')?.addEventListener('click', () => {
      advancedAnalysisModal.show(this.imageLoader);
    });

    $('#btn-palette-home')?.addEventListener('click', () => {
      this.palettePage.show(false);
    });

    $('#btn-palette-gen')?.addEventListener('click', () => {
      this.palettePage.show(true);
    });

    $('#btn-settings')?.addEventListener('click', () => {
      settingsModal.show();
    });
    $('#btn-undo')?.addEventListener('click', () => this._undo());
    $('#btn-redo')?.addEventListener('click', () => this._redo());
    
    bus.on('settings:changed', () => {
      this.canvasEngine.render();
    });

    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this._undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        this._redo();
      }
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
      entry.state = this._captureCanvasState();
      this._setHistory(history);
    }
  }

  _updateHUD(pixel, pos, metricPixel = pixel) {
    const hud = $('#color-hud');
    
    const isMenuOpen = $('#context-menu') && !$('#context-menu').classList.contains('hidden');
    const isSelectTool = bus._currentTool === 'move';
    const isRightDragging = this.canvasEngine.isPanning || this.canvasEngine._rightBtnDown;
    
    if (!pixel || !isSelectTool || isMenuOpen || isRightDragging) { 
      hud.classList.add('hidden'); 
      return; 
    }
    
    hud.classList.remove('hidden');
    const activeFilter = this.canvasEngine._activeFilter;
    const rowHex = $('#hud-hex')?.closest('.hud-row');
    const rowRgb = $('#hud-rgb')?.closest('.hud-row');
    const rowHsl = $('#hud-hsl')?.closest('.hud-row');
    const rowBrightness = $('#hud-brightness')?.closest('.hud-row');
    const hexLabel = rowHex?.querySelector('.hud-label');
    const brightLabel = rowBrightness?.querySelector('.hud-label');

    const setCompactMode = (enabled) => {
      if (rowHex) rowHex.style.display = '';
      if (rowRgb) rowRgb.style.display = enabled ? 'none' : '';
      if (rowHsl) rowHsl.style.display = enabled ? 'none' : '';
      if (rowBrightness) rowBrightness.style.display = enabled ? 'none' : '';
    };

    if (activeFilter === 'grayscale') {
      const gray = Math.round(0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b);
      const grayPct = Math.round((gray / 255) * 100);
      setCompactMode(true);
      if (hexLabel) hexLabel.textContent = '灰階';
      $('#hud-name').textContent = '灰階模式';
      $('#hud-preview').style.backgroundColor = `rgb(${gray}, ${gray}, ${gray})`;
      $('#hud-hex').textContent = `${grayPct}%`;
      const offset = 20;
      let x = pos.screenX + offset, y = pos.screenY + offset;
      const hudRect = hud.getBoundingClientRect();
      if (x + hudRect.width > window.innerWidth - 10) x = pos.screenX - hudRect.width - offset;
      if (y + hudRect.height > window.innerHeight - 10) y = pos.screenY - hudRect.height - offset;
      hud.style.left = x + 'px';
      hud.style.top = y + 'px';
      return;
    }

    if (activeFilter === 'saturation') {
      const sourcePixel = metricPixel || pixel;
      const satPct = Math.round(rgbToHsv(sourcePixel.r, sourcePixel.g, sourcePixel.b).s);
      setCompactMode(true);
      if (hexLabel) hexLabel.textContent = '飽和度';
      $('#hud-name').textContent = '飽和度模式';
      $('#hud-preview').style.backgroundColor = rgbToHex(pixel.r, pixel.g, pixel.b);
      $('#hud-hex').textContent = `${satPct}%`;
      const offset = 20;
      let x = pos.screenX + offset, y = pos.screenY + offset;
      const hudRect = hud.getBoundingClientRect();
      if (x + hudRect.width > window.innerWidth - 10) x = pos.screenX - hudRect.width - offset;
      if (y + hudRect.height > window.innerHeight - 10) y = pos.screenY - hudRect.height - offset;
      hud.style.left = x + 'px';
      hud.style.top = y + 'px';
      return;
    }

    setCompactMode(false);
    if (hexLabel) hexLabel.textContent = 'HEX';
    if (brightLabel) brightLabel.textContent = '明度';

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

  _updateFilterLegend(type) {
    const legend = $('#filter-legend');
    if (!legend) return;
    
    if (!type || (type !== 'grayscale' && type !== 'saturation')) {
      legend.classList.add('hidden');
      return;
    }

    legend.classList.remove('hidden');
    const label = $('#filter-legend-label');
    const bg = $('#filter-legend-bar-bg');
    
    if (type === 'grayscale') {
      label.textContent = '灰階';
      bg.style.background = 'linear-gradient(to right, #000000, #ffffff)';
    } else if (type === 'saturation') {
      label.textContent = '飽和度';
      // Generate gradient programmatically from saturationHeatColor
      import('./core/ColorMath.js').then(({ saturationHeatColor }) => {
        const stops = [];
        for (let i = 0; i <= 20; i++) {
          const pct = i * 5;
          const [r, g, b] = saturationHeatColor(pct);
          stops.push(`rgb(${r},${g},${b}) ${pct}%`);
        }
        bg.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
      });
    }
  }

  _updateFilterLegendArrow(pixel, metricPixel = pixel) {
    const legend = $('#filter-legend');
    if (!legend || legend.classList.contains('hidden') || !pixel) return;

    const arrow = $('#filter-legend-arrow');
    const valText = $('#filter-legend-value');
    const type = this.canvasEngine._activeFilter;
    
    let pct = 0;
    if (type === 'grayscale') {
      const gray = Math.round(0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b);
      pct = (gray / 255) * 100;
      valText.textContent = Math.round(pct) + '%';
    } else if (type === 'saturation') {
      const sourcePixel = metricPixel || pixel;
      const hsv = rgbToHsv(sourcePixel.r, sourcePixel.g, sourcePixel.b);
      pct = hsv.s;
      valText.textContent = Math.round(pct) + '%';
    }

    arrow.style.left = `${pct}%`;
  }

  // ===== Analysis =====
  _queueAnalysisUpdate() {
    if (this._analysisTimeout) clearTimeout(this._analysisTimeout);
    this._analysisTimeout = setTimeout(() => {
      const data = this.canvasEngine.getCompositeImageData() || this.imageLoader.imageData;
      if (data) this._runAnalysis(data);
    }, 400); // 400ms debounce
  }

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

    const openColorDetails = (color) => {
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
    };

    const existing = [...container.children];
    palette.forEach((color, index) => {
      let swatch = existing[index];
      if (!swatch) {
        swatch = createElement('div', { className: 'palette-swatch' }, [
          createElement('span', { className: 'swatch-tooltip' }),
          createElement('span', { className: 'swatch-pct' })
        ]);
        container.appendChild(swatch);
      }

      swatch.style.backgroundColor = color.hex;
      swatch.onclick = () => openColorDetails(color);
      $('.swatch-tooltip', swatch).textContent = color.hex.toUpperCase();
      $('.swatch-pct', swatch).textContent = `${color.percentage}%`;
    });

    existing.slice(palette.length).forEach(node => node.remove());
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
    // Each zone's tabs switch independently
    $$('.panel-tabs').forEach(tabBar => {
      const zone = tabBar.closest('.panel-zone');
      if (!zone) return;
      
      const tabs = $$('.panel-tab', tabBar);
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Deactivate siblings in same zone
          tabs.forEach(t => t.classList.remove('active'));
          $$('.panel-content', zone).forEach(c => c.classList.remove('active'));
          
          tab.classList.add('active');
          const content = $(`.panel-content[data-content="${tab.dataset.tab}"]`, zone);
          content?.classList.add('active');
          
          if (tab.dataset.tab === 'analysis' && this.imageLoader.imageData) {
            setTimeout(() => this._drawHistograms(this.imageLoader.imageData), 50);
          }
        });
      });
    });
  }

  _initPanelResize() {
    const divider = $('#panel-zone-divider');
    const sidePanel = $('#side-panel');
    const upper = $('.panel-zone-upper');
    const lower = $('.panel-zone-lower');
    if (!divider || !sidePanel || !upper || !lower) return;

    const storageKey = 'colorscope-panel-upper-ratio';
    const minZonePx = 120;

    const applyRatio = (ratio) => {
      const panelHeight = sidePanel.getBoundingClientRect().height;
      const dividerHeight = divider.getBoundingClientRect().height || 3;
      const available = panelHeight - dividerHeight;
      if (available <= minZonePx * 2) return;

      const minRatio = minZonePx / available;
      const clampedRatio = Math.max(minRatio, Math.min(1 - minRatio, ratio));
      const upperPx = available * clampedRatio;
      const lowerPx = available - upperPx;

      upper.style.flex = `0 0 ${upperPx}px`;
      lower.style.flex = `0 0 ${lowerPx}px`;
    };

    const readStoredRatio = () => {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : 0.52;
    };

    const writeStoredRatio = () => {
      const panelHeight = sidePanel.getBoundingClientRect().height;
      const dividerHeight = divider.getBoundingClientRect().height || 3;
      const available = panelHeight - dividerHeight;
      if (available <= 0) return;
      const upperHeight = upper.getBoundingClientRect().height;
      localStorage.setItem(storageKey, String(upperHeight / available));
    };

    applyRatio(readStoredRatio());
    window.addEventListener('resize', () => applyRatio(readStoredRatio()));
    bus.on('image:loaded', () => requestAnimationFrame(() => applyRatio(readStoredRatio())));

    divider.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const startY = e.clientY;
      const startUpper = upper.getBoundingClientRect().height;
      const panelHeight = sidePanel.getBoundingClientRect().height;
      const dividerHeight = divider.getBoundingClientRect().height || 3;
      const available = panelHeight - dividerHeight;
      if (available <= minZonePx * 2) return;

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';

      const onMove = (ev) => {
        const delta = ev.clientY - startY;
        const nextUpper = Math.max(minZonePx, Math.min(available - minZonePx, startUpper + delta));
        const nextLower = available - nextUpper;
        upper.style.flex = `0 0 ${nextUpper}px`;
        lower.style.flex = `0 0 ${nextLower}px`;
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        writeStoredRatio();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  _switchToTab(zone, tabName) {
    const zoneEl = $(`.panel-zone-${zone}`);
    if (!zoneEl) return;
    const tabBar = $('.panel-tabs', zoneEl);
    if (!tabBar) return;
    const tabs = $$('.panel-tab', tabBar);
    tabs.forEach(t => t.classList.remove('active'));
    $$('.panel-content', zoneEl).forEach(c => c.classList.remove('active'));
    const targetTab = tabs.find(t => t.dataset.tab === tabName);
    if (targetTab) targetTab.classList.add('active');
    const content = $(`.panel-content[data-content="${tabName}"]`, zoneEl);
    if (content) content.classList.add('active');
  }

  _showPropertyPanel(html, autoSwitchToTab = true, state = null) {
    const container = $('#properties-content');
    if (!container) return;
    container.innerHTML = html;
    if (state) {
      this._propertyPanelState = state;
    }
    if (autoSwitchToTab) {
      this._switchToTab('upper', 'properties');
    }
  }

  _clearPropertyPanel() {
    const container = $('#properties-content');
    if (!container) return;
    this._propertyPanelState = { type: 'empty' };
    container.innerHTML = '<div class="empty-state"><p>選擇濾鏡或調整圖層</p><p class="hint">啟用左側濾鏡或點擊調整圖層以顯示屬性</p></div>';
  }

  _renderFilterProps(filterName) {
    const labels = { hue: '色相隔離', analogous: '相似色檢查', complementary: '對比色檢查' };
    const isHue = filterName === 'hue';
    const isHarmony = filterName === 'analogous' || filterName === 'complementary';

    let html = `<h3 class="section-title">${labels[filterName] || filterName}</h3>`;

    if (isHue) {
      const hueStartVal = this._filterSettings.hue.start;
      const hueEndVal = this._filterSettings.hue.end;
      html += `
        <div class="property-slider-group">
          <div class="hue-range-bar hue-range-bar-compact" id="prop-hue-range-bar"></div>
        </div>
        <label class="property-slider-group">
          <div class="property-slider-head">
            <span class="property-slider-label">起始色相</span><span class="property-slider-value" id="prop-hue-start-val">${hueStartVal}°</span>
          </div>
          <input class="property-slider" type="range" id="prop-hue-start" min="0" max="360" value="${hueStartVal}">
        </label>
        <label class="property-slider-group">
          <div class="property-slider-head">
            <span class="property-slider-label">結束色相</span><span class="property-slider-value" id="prop-hue-end-val">${hueEndVal}°</span>
          </div>
          <input class="property-slider" type="range" id="prop-hue-end" min="0" max="360" value="${hueEndVal}">
        </label>
      `;
    }

    if (isHarmony) {
      const harmonyCfg = this._filterSettings[filterName] || { baseHue: 0, tol: 30 };
      html += `
        <p class="property-intro">
          ${filterName === 'analogous' ? '高亮與基準色相鄰的色彩，其餘灰階化。' : '高亮基準色的互補色（對向 180°），其餘灰階化。'}
        </p>
        <label class="property-slider-group">
          <div class="property-slider-head">
            <span class="property-slider-label">基準色相</span><span class="property-slider-value" id="prop-harmony-hue-val">${harmonyCfg.baseHue}°</span>
          </div>
          <input class="property-slider" type="range" id="prop-harmony-hue" min="0" max="360" value="${harmonyCfg.baseHue}">
          <div id="prop-harmony-preview" class="property-preview-chip" style="background:hsl(${harmonyCfg.baseHue},100%,50%);"></div>
        </label>
        <label class="property-slider-group">
          <div class="property-slider-head">
            <span class="property-slider-label">容差角度</span><span class="property-slider-value" id="prop-harmony-tol-val">±${harmonyCfg.tol}°</span>
          </div>
          <input class="property-slider" type="range" id="prop-harmony-tol" min="5" max="90" value="${harmonyCfg.tol}">
        </label>
      `;
    }

    this._showPropertyPanel(html, true, { type: 'filter', filterName });

    // Bind events after DOM is set
    if (isHue) {
      const hs = $('#prop-hue-start'), he = $('#prop-hue-end');
      const applyHue = () => {
        const s = parseInt(hs.value), e = parseInt(he.value);
        this._filterSettings.hue.start = s;
        this._filterSettings.hue.end = e;
        $('#prop-hue-start-val').textContent = s + '°';
        $('#prop-hue-end-val').textContent = e + '°';
        bus.emit('filter:apply', { type: 'hue', params: this._getFilterRange('hue') });
      };
      hs.addEventListener('input', applyHue);
      he.addEventListener('input', applyHue);
      applyHue();
    }

    if (isHarmony) {
      const hueSlider = $('#prop-harmony-hue'), tolSlider = $('#prop-harmony-tol');
      const applyHarmony = () => {
        const baseHue = parseInt(hueSlider.value);
        const tol = parseInt(tolSlider.value);
        this._filterSettings[filterName] = { baseHue, tol };
        $('#prop-harmony-hue-val').textContent = baseHue + '°';
        $('#prop-harmony-tol-val').textContent = `±${tol}°`;
        $('#prop-harmony-preview').style.background = `hsl(${baseHue}, 100%, 50%)`;

        bus.emit('filter:apply', { type: 'hue', params: this._getFilterRange(filterName) });
      };
      hueSlider.addEventListener('input', applyHarmony);
      tolSlider.addEventListener('input', applyHarmony);
      applyHarmony();
    }
  }

  _renderBrushProps(toolName = 'brush') {
    const isEraser = toolName === 'eraser';
    const settings = this._brushSettings[toolName];
    if (!settings) return;

    let html = `<h3 class="section-title">${isEraser ? '橡皮擦 Eraser' : '畫筆 Brush'}</h3>`;

    if (!isEraser) {
      const brushHex = hslToHex(settings.h, settings.s, settings.l).toUpperCase();
      html += `
        <div class="brush-color-card">
          <div class="brush-picker-topbar">
            <div class="brush-color-preview-wrap">
              <div class="brush-color-preview" id="brush-color-preview" style="background:${brushHex};"></div>
              <div class="brush-color-meta">
                <strong id="brush-color-hex">${brushHex}</strong>
                <span id="brush-color-hsl">H ${settings.h}° / S ${settings.s}% / L ${settings.l}%</span>
              </div>
            </div>
            <button class="brush-eyedropper-btn" id="brush-eyedropper-btn" type="button">取色器 Eyedropper</button>
          </div>
          <canvas id="brush-hls-canvas" class="brush-hls-canvas" width="260" height="260"></canvas>
        </div>
      `;
    }

    html += `
      ${this._makeSlider('brush-size', '大小 Size', 'size', settings.size, 1, 240)}
      ${this._makeSlider('brush-opacity', '不透明度 Opacity', 'opacity', settings.opacity, 1, 100)}
      ${this._makeSlider('brush-flow', '流量 Flow', 'flow', settings.flow, 1, 100)}
      ${this._makeSlider('brush-hardness', '軟硬 Hardness', 'hardness', settings.hardness, 1, 100)}
      <div class="brush-toggle-grid">
        <label class="brush-toggle">
          <input type="checkbox" id="brush-pressure-size" ${settings.pressureSize ? 'checked' : ''}>
          <span>壓感控制大小 Pressure Size</span>
        </label>
        <label class="brush-toggle">
          <input type="checkbox" id="brush-pressure-opacity" ${settings.pressureOpacity ? 'checked' : ''}>
          <span>壓感控制不透明度 Pressure Opacity</span>
        </label>
      </div>
    `;

    this._showPropertyPanel(html, true, { type: 'brush', toolName });

    const container = $('#properties-content');
    if (!container) return;

    const sliderIds = ['size', 'opacity', 'flow', 'hardness'];
    sliderIds.forEach((key) => {
      const slider = $(`#brush-${key}`, container);
      if (!slider) return;
      const syncValue = () => {
        const valueEl = slider.parentElement?.querySelector('.adj-val');
        if (valueEl) {
          valueEl.textContent = key === 'size' ? String(Math.round(settings[key])) : `${settings[key]}%`;
        }
      };
      slider.addEventListener('input', () => {
        settings[key] = key === 'size' ? Number(slider.value) : parseInt(slider.value, 10);
        syncValue();
        this._saveCurrentState();
        this._queueHistoryCheckpoint();
      });
      syncValue();
    });

    $('#brush-pressure-size', container)?.addEventListener('change', (e) => {
      settings.pressureSize = e.target.checked;
      this._saveCurrentState();
      this._queueHistoryCheckpoint(true);
    });
    $('#brush-pressure-opacity', container)?.addEventListener('change', (e) => {
      settings.pressureOpacity = e.target.checked;
      this._saveCurrentState();
      this._queueHistoryCheckpoint(true);
    });

    if (isEraser) return;

    const colorCanvas = $('#brush-hls-canvas', container);
    const eyedropperBtn = $('#brush-eyedropper-btn', container);
    const hexEl = $('#brush-color-hex', container);
    const hslEl = $('#brush-color-hsl', container);
    const previewEl = $('#brush-color-preview', container);

    const redrawColorPanel = () => {
      if (!colorCanvas) return;
      const ctx = colorCanvas.getContext('2d');
      const width = colorCanvas.width;
      const height = colorCanvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const outerR = Math.min(width, height) / 2 - 12;
      const innerR = outerR - 24;
      const squareSize = Math.round(innerR * Math.SQRT2 - 8);
      const squareX = Math.round(cx - squareSize / 2);
      const squareY = Math.round(cy - squareSize / 2);

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < 360; i++) {
        const start = ((i - 1) * Math.PI) / 180;
        const end = ((i + 1) * Math.PI) / 180;
        ctx.beginPath();
        ctx.strokeStyle = `hsl(${i}, 100%, 50%)`;
        ctx.lineWidth = outerR - innerR;
        ctx.arc(cx, cy, (outerR + innerR) / 2, start, end);
        ctx.stroke();
      }

      const square = ctx.createImageData(squareSize, squareSize);
      for (let y = 0; y < squareSize; y++) {
        const lightness = Math.round(100 - (y / (squareSize - 1)) * 100);
        for (let x = 0; x < squareSize; x++) {
          const saturation = Math.round((x / (squareSize - 1)) * 100);
          const hex = hslToHex(settings.h, saturation, lightness);
          const idx = (y * squareSize + x) * 4;
          square.data[idx] = parseInt(hex.slice(1, 3), 16);
          square.data[idx + 1] = parseInt(hex.slice(3, 5), 16);
          square.data[idx + 2] = parseInt(hex.slice(5, 7), 16);
          square.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(square, squareX, squareY);

      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(squareX + 0.5, squareY + 0.5, squareSize - 1, squareSize - 1);
      ctx.restore();

      const hueRad = (settings.h - 90) * (Math.PI / 180);
      const ringMarkerRadius = (outerR + innerR) / 2;
      const hueX = cx + Math.cos(hueRad) * ringMarkerRadius;
      const hueY = cy + Math.sin(hueRad) * ringMarkerRadius;
      const squareMarkerX = squareX + (settings.s / 100) * squareSize;
      const squareMarkerY = squareY + ((100 - settings.l) / 100) * squareSize;

      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hueX, hueY, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(squareMarkerX, squareMarkerY, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(15,23,42,0.72)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hueX, hueY, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(squareMarkerX, squareMarkerY, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    const syncColorMeta = () => {
      const hex = hslToHex(settings.h, settings.s, settings.l).toUpperCase();
      if (hexEl) hexEl.textContent = hex;
      if (hslEl) hslEl.textContent = `H ${settings.h}° / S ${settings.s}% / L ${settings.l}%`;
      if (previewEl) previewEl.style.background = hex;
      redrawColorPanel();
      this._saveCurrentState();
      this._queueHistoryCheckpoint();
    };

    let draggingColor = false;
    let dragZone = null;
    const applyCanvasPoint = (event) => {
      if (!colorCanvas) return;
      const rect = colorCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      const width = colorCanvas.width;
      const height = colorCanvas.height;
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const px = x * scaleX;
      const py = y * scaleY;
      const cx = width / 2;
      const cy = height / 2;
      const outerR = Math.min(width, height) / 2 - 12;
      const innerR = outerR - 24;
      const squareSize = Math.round(innerR * Math.SQRT2 - 8);
      const squareX = Math.round(cx - squareSize / 2);
      const squareY = Math.round(cy - squareSize / 2);
      const dx = px - cx;
      const dy = py - cy;
      const distance = Math.hypot(dx, dy);

      if (!dragZone) {
        if (distance >= innerR && distance <= outerR) dragZone = 'ring';
        else if (px >= squareX && px <= squareX + squareSize && py >= squareY && py <= squareY + squareSize) dragZone = 'square';
        else return;
      }

      if (dragZone === 'ring') {
        settings.h = (Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 450) % 360;
      } else if (dragZone === 'square') {
        settings.s = Math.round(((px - squareX) / squareSize) * 100);
        settings.l = Math.round(100 - ((py - squareY) / squareSize) * 100);
        settings.s = Math.max(0, Math.min(100, settings.s));
        settings.l = Math.max(0, Math.min(100, settings.l));
      }
      syncColorMeta();
    };

    colorCanvas?.addEventListener('pointerdown', (event) => {
      draggingColor = true;
      dragZone = null;
      colorCanvas.setPointerCapture?.(event.pointerId);
      applyCanvasPoint(event);
    });
    colorCanvas?.addEventListener('pointermove', (event) => {
      if (!draggingColor) return;
      applyCanvasPoint(event);
    });
    const stopCanvasDrag = () => {
      draggingColor = false;
      dragZone = null;
    };
    colorCanvas?.addEventListener('pointerup', stopCanvasDrag);
    colorCanvas?.addEventListener('pointercancel', stopCanvasDrag);
    colorCanvas?.addEventListener('lostpointercapture', stopCanvasDrag);

    eyedropperBtn?.addEventListener('click', async () => {
      if (!window.EyeDropper) return;
      try {
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        const hex = result?.sRGBHex;
        if (!hex) return;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const hsl = rgbToHsl(r, g, b);
        settings.h = hsl.h;
        settings.s = hsl.s;
        settings.l = hsl.l;
        syncColorMeta();
      } catch {}
    });

    if (eyedropperBtn && !window.EyeDropper) {
      eyedropperBtn.disabled = true;
      eyedropperBtn.textContent = '取色器不支援';
    }

    syncColorMeta();
  }

  _renderAdjustLayerProps(layer, autoSwitchToTab = false) {
    if (!layer || layer.type !== 'adjustment') {
      this._clearPropertyPanel();
      return;
    }

    const nameMap = { hsl: '色相/飽和度/明度', levels: '色階 (Levels)', curves: '曲線 (Curves)', colorbalance: '色彩平衡', temperature: '色溫' };
    const params = layer.adjustParams;
    let html = `<h3 class="section-title">${nameMap[layer.adjustType] || layer.adjustType}</h3>`;

    if (layer.adjustType === 'hsl') {
      html += this._makeSlider('adj-layer-hue', '色相 (Hue)', 'hue', params.hue, -180, 180);
      html += this._makeSlider('adj-layer-sat', '飽和度 (Saturation)', 'saturation', params.saturation, -100, 100);
      html += this._makeSlider('adj-layer-bri', '明度 (Lightness)', 'brightness', params.brightness, -100, 100);
    } else if (layer.adjustType === 'levels') {
      // CSP-style Levels: Histogram + 3 draggable handles (black, gamma, white)
      const gammaPos = (params.gamma === undefined ? 1.0 : params.gamma);
      const minPct = (params.levelsMin / 255) * 100;
      const maxPct = (params.levelsMax / 255) * 100;
      const gammaPct = minPct + (maxPct - minPct) * (1 / (gammaPos + 1));
      html += `
        <div style="position:relative; margin-bottom:6px;">
          <canvas id="levels-histogram" style="width:100%; height:80px; display:block; border-radius:6px; background:rgba(0,0,0,0.3);"></canvas>
          <div id="levels-bar" style="position:relative; height:24px; margin-top:2px; background:linear-gradient(to right, #000, #fff); border-radius:4px;">
            <div id="levels-handle-min" class="levels-handle" data-key="levelsMin" style="left:${minPct}%; position:absolute; bottom:0; width:0; height:0; border-left:7px solid transparent; border-right:7px solid transparent; border-bottom:10px solid #000; transform:translateX(-7px); cursor:ew-resize; filter:drop-shadow(0 1px 2px rgba(255,255,255,0.4));"></div>
            <div id="levels-handle-gamma" class="levels-handle" data-key="gamma" style="left:${gammaPct}%; position:absolute; bottom:0; width:0; height:0; border-left:7px solid transparent; border-right:7px solid transparent; border-bottom:10px solid #888; transform:translateX(-7px); cursor:ew-resize; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"></div>
            <div id="levels-handle-max" class="levels-handle" data-key="levelsMax" style="left:${maxPct}%; position:absolute; bottom:0; width:0; height:0; border-left:7px solid transparent; border-right:7px solid transparent; border-bottom:10px solid #fff; transform:translateX(-7px); cursor:ew-resize; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"></div>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-tertiary); margin-bottom:8px;">
          <span>黑點: <b id="levels-min-val" style="color:var(--text-primary);">${params.levelsMin}</b></span>
          <span>中間調: <b id="levels-gamma-val" style="color:var(--text-primary);">${gammaPos.toFixed(2)}</b></span>
          <span>白點: <b id="levels-max-val" style="color:var(--text-primary);">${params.levelsMax}</b></span>
        </div>
      `;
    } else if (layer.adjustType === 'curves') {
      // CSP-style Curves: Interactive spline canvas
      html += `
        <div style="position:relative; margin-bottom:8px; border:1px solid var(--border-subtle); border-radius:6px; overflow:hidden; background:rgba(0,0,0,0.3);">
          <canvas id="curves-canvas" style="width:100%; height:200px; display:block; cursor:crosshair;"></canvas>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-tertiary);">
          <span>點擊添加節點 · 拖移調整 · 右鍵刪除</span>
          <button id="curves-reset-btn" style="background:none; border:1px solid var(--border-subtle); color:var(--text-secondary); border-radius:4px; padding:2px 8px; cursor:pointer; font-size:11px;">重置</button>
        </div>
      `;
    } else if (layer.adjustType === 'colorbalance') {
      html += this._makeSlider('adj-layer-cr', '紅-青 (Red-Cyan)', 'redCyan', params.redCyan || 0, -100, 100);
      html += this._makeSlider('adj-layer-mg', '綠-洋紅 (Green-Magenta)', 'greenMagenta', params.greenMagenta || 0, -100, 100);
      html += this._makeSlider('adj-layer-by', '藍-黃 (Blue-Yellow)', 'blueYellow', params.blueYellow || 0, -100, 100);
    } else if (layer.adjustType === 'temperature') {
      html += this._makeSlider('adj-layer-temp', '色溫 (Temperature)', 'temperature', params.temperature || 0, -100, 100);
      html += this._makeSlider('adj-layer-tint', '色調 (Tint)', 'tint', params.tint || 0, -100, 100);
    }

    this._showPropertyPanel(html, autoSwitchToTab, { type: 'adjustment', layerId: layer.id });

    // Bind all generic sliders (HSL, colorbalance, temperature)
    const container = $('#properties-content');
    const sliders = container.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
      slider.addEventListener('input', () => {
        const key = slider.dataset.paramKey;
        const val = parseFloat(slider.value);
        layer.adjustParams[key] = val;
        slider.parentElement.querySelector('.adj-val').textContent = val;
        bus.emit('layers:properties-changed');
      });
    });

    // === Levels interactive panel ===
    if (layer.adjustType === 'levels') {
      this._initLevelsPanel(layer);
    }

    // === Curves interactive panel ===
    if (layer.adjustType === 'curves') {
      this._initCurvesPanel(layer);
    }
  }

  _initLevelsPanel(layer) {
    const histCanvas = $('#levels-histogram');
    if (!histCanvas) return;

    // Draw brightness histogram from current composite
    const imgData = this.canvasEngine.getCompositeImageData() || this.imageLoader.imageData;
    if (imgData) {
      const bins = HistogramAnalyzer.brightnessHistogram(imgData);
      HistogramAnalyzer.drawHistogram(histCanvas, bins, '#94a3b8');
    }

    const bar = $('#levels-bar');
    if (!bar) return;

    const gammaEl = $('#levels-handle-gamma');
    const gammaValEl = $('#levels-gamma-val');

    const updateGammaPosition = () => {
      if (!gammaEl) return;
      const gamma = layer.adjustParams.gamma || 1.0;
      const minPct = (layer.adjustParams.levelsMin / 255) * 100;
      const maxPct = (layer.adjustParams.levelsMax / 255) * 100;
      const gammaPct = minPct + (maxPct - minPct) * (1 / (gamma + 1));
      gammaEl.style.left = `${gammaPct}%`;
      if (gammaValEl) gammaValEl.textContent = gamma.toFixed(2);
    };

    // Black/White point handles
    const bwHandles = [
      { el: $('#levels-handle-min'), key: 'levelsMin', valEl: $('#levels-min-val') },
      { el: $('#levels-handle-max'), key: 'levelsMax', valEl: $('#levels-max-val') }
    ];

    bwHandles.forEach(({ el, key, valEl }) => {
      if (!el) return;
      let dragging = false;

      const onMove = (e) => {
        if (!dragging) return;
        const rect = bar.getBoundingClientRect();
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        const val = Math.round(pct * 255);

        if (key === 'levelsMin' && val >= layer.adjustParams.levelsMax) return;
        if (key === 'levelsMax' && val <= layer.adjustParams.levelsMin) return;

        layer.adjustParams[key] = val;
        el.style.left = `${pct * 100}%`;
        valEl.textContent = val;
        updateGammaPosition();
        bus.emit('layers:properties-changed');
      };

      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        dragging = true;
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', () => {
          dragging = false;
          window.removeEventListener('mousemove', onMove);
        }, { once: true });
      });
    });

    // Gamma / Midtone handle
    if (gammaEl) {
      let dragging = false;
      const onMove = (e) => {
        if (!dragging) return;
        const rect = bar.getBoundingClientRect();
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));

        // Gamma is mapped from position relative to min/max range
        const minPct = layer.adjustParams.levelsMin / 255;
        const maxPct = layer.adjustParams.levelsMax / 255;
        // Clamp within min/max
        pct = Math.max(minPct + 0.01, Math.min(maxPct - 0.01, pct));
        // Convert position to gamma value
        const relPos = (pct - minPct) / Math.max(0.01, maxPct - minPct);
        // relPos = 1 / (gamma + 1), so gamma = (1 / relPos) - 1
        const gamma = Math.max(0.1, Math.min(9.9, (1 / relPos) - 1));

        layer.adjustParams.gamma = Math.round(gamma * 100) / 100;
        gammaEl.style.left = `${pct * 100}%`;
        if (gammaValEl) gammaValEl.textContent = layer.adjustParams.gamma.toFixed(2);
        bus.emit('layers:properties-changed');
      };

      gammaEl.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        dragging = true;
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', () => {
          dragging = false;
          window.removeEventListener('mousemove', onMove);
        }, { once: true });
      });
    }
  }

  async _initCurvesPanel(layer) {
    const canvas = $('#curves-canvas');
    if (!canvas) return;
    
    // Load spline math once before drawing
    const { interpolateSpline } = await import('./core/ColorMath.js');

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : 240;
    const h = rect.height > 0 ? rect.height : 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const points = layer.adjustParams.points;
    let dragIdx = -1;

    const toCanvas = (pt) => [pt[0] / 255 * w, (1 - pt[1] / 255) * h];
    const toData = (cx, cy) => [Math.round(cx / w * 255), Math.round((1 - cy / h) * 255)];

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(w * i / 4, 0); ctx.lineTo(w * i / 4, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h * i / 4); ctx.lineTo(w, h * i / 4); ctx.stroke();
      }

      // Diagonal reference line
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke();
      ctx.setLineDash([]);

      // Draw spline curve
      if (points.length >= 2) {
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const lut = interpolateSpline(points, 256);
        for (let i = 0; i < 256; i++) {
          const cx = i / 255 * w;
          const cy = (1 - lut[i]) * h;
          if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
        }
        ctx.stroke();

        // Draw control points
        points.forEach((pt, idx) => {
          const [cx, cy] = toCanvas(pt);
          ctx.fillStyle = idx === dragIdx ? '#c084fc' : '#6366f1';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        });
      }
    };

    draw();

    // Mouse interactions
    const getMousePos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    const findPoint = (mx, my) => {
      for (let i = 0; i < points.length; i++) {
        const [cx, cy] = toCanvas(points[i]);
        if (Math.abs(mx - cx) < 10 && Math.abs(my - cy) < 10) return i;
      }
      return -1;
    };

    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const [mx, my] = getMousePos(e);

      if (e.button === 2) {
        // Right-click: remove point (if not first/last)
        const idx = findPoint(mx, my);
        if (idx > 0 && idx < points.length - 1) {
          points.splice(idx, 1);
          draw();
          bus.emit('layers:properties-changed');
        }
        return;
      }

      const idx = findPoint(mx, my);
      if (idx >= 0) {
        // Start dragging existing point
        dragIdx = idx;
      } else {
        // Add new point
        const [dx, dy] = toData(mx, my);
        // Insert sorted by x
        let insertIdx = points.findIndex(p => p[0] > dx);
        if (insertIdx === -1) insertIdx = points.length;
        points.splice(insertIdx, 0, [Math.max(0, Math.min(255, dx)), Math.max(0, Math.min(255, dy))]);
        dragIdx = insertIdx;
        draw();
        bus.emit('layers:properties-changed');
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (dragIdx < 0) return;
      const [mx, my] = getMousePos(e);
      let [dx, dy] = toData(mx, my);
      dx = Math.max(0, Math.min(255, dx));
      dy = Math.max(0, Math.min(255, dy));

      // First and last points: lock X
      if (dragIdx === 0) dx = 0;
      if (dragIdx === points.length - 1) dx = 255;

      // Clamp X between neighbors
      if (dragIdx > 0) dx = Math.max(points[dragIdx - 1][0] + 1, dx);
      if (dragIdx < points.length - 1) dx = Math.min(points[dragIdx + 1][0] - 1, dx);

      points[dragIdx] = [dx, dy];
      draw();
      bus.emit('layers:properties-changed');
    });

    canvas.addEventListener('mouseup', () => { dragIdx = -1; });
    canvas.addEventListener('mouseleave', () => { dragIdx = -1; });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Reset button
    $('#curves-reset-btn')?.addEventListener('click', () => {
      layer.adjustParams.points = [[0, 0], [128, 128], [255, 255]];
      points.length = 0;
      points.push(...layer.adjustParams.points);
      draw();
      bus.emit('layers:properties-changed');
    });
  }

  _makeSlider(id, label, paramKey, value, min, max) {
    return `
      <label class="property-slider-group">
        <div class="property-slider-head">
          <span class="property-slider-label">${label}</span><span class="adj-val property-slider-value">${value}</span>
        </div>
        <input class="property-slider" type="range" id="${id}" data-param-key="${paramKey}" min="${min}" max="${max}" value="${value}">
      </label>
    `;
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
        } else if (obj.type === 'brush') {
          items.push({ label: obj.mode === 'erase' ? '刪除橡皮擦筆畫' : '刪除筆刷筆畫', action: 'delete-obj', data: { objId: obj.id }, danger: true });
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

    // Adjustment layer dropdown
    const adjustBtn = $('#btn-add-adjust');
    const adjustMenu = $('#adjust-layer-menu');
    if (adjustBtn && adjustMenu) {
      adjustBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        adjustMenu.classList.toggle('hidden');
      });
      $$('.dropdown-item[data-adjust]').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const type = item.dataset.adjust;
          this.layerManager.addAdjustmentLayer(type);
          adjustMenu.classList.add('hidden');
        });
      });
      // Close dropdown on outside click
      window.addEventListener('mousedown', (e) => {
        if (!adjustBtn.contains(e.target) && !adjustMenu.contains(e.target)) {
          adjustMenu.classList.add('hidden');
        }
      });
    }

    this._renderLayerPanel();
  }

  _renderLayerPanel() {
    const list = $('#layer-list');
    if (!list) return;
    list.innerHTML = '';

    for (let i = this.layerManager.layers.length - 1; i >= 0; i--) {
      const layer = this.layerManager.layers[i];
      const isActive = layer.id === this.layerManager.activeLayerId;
      const isAdjust = layer.type === 'adjustment';

      const namePrefix = isAdjust ? '◆ ' : '';
      const item = createElement('div', { 
        className: `layer-item${isActive ? ' active' : ''}${isAdjust ? ' adjustment' : ''}`,
        draggable: 'true'
      }, [
        createElement('button', {
          className: `layer-visibility${layer.visible ? ' visible' : ''}`,
          innerHTML: layer.visible ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
          onClick: (e) => { e.stopPropagation(); this.layerManager.toggleLayerVisibility(layer.id); }
        }),
        createElement('span', {
          className: 'layer-name', textContent: namePrefix + layer.name,
          style: isAdjust ? { color: 'var(--accent)', fontStyle: 'italic' } : {},
          onDblclick: () => this._renameLayerInline(layer)
        }),
        createElement('span', { className: 'layer-count', textContent: isAdjust ? '' : `${layer.objects.length}` }),
        createElement('button', {
          className: 'layer-delete',
          innerHTML: '×',
          onClick: (e) => { e.stopPropagation(); this.layerManager.removeLayer(layer.id); }
        })
      ]);

      item.dataset.layerId = layer.id;

      // Drag and Drop Events
      item.addEventListener('dragstart', (e) => {
        window._colorScopeDraggedLayerId = layer.id; // Guarantee type & retrieval
        window._colorScopePendingDrop = null;
        if (e.dataTransfer) {
           e.dataTransfer.effectAllowed = 'move';
           e.dataTransfer.setData('text/plain', layer.id);
        }
        item.style.opacity = '0.5';
      });
      item.addEventListener('dragend', () => {
        item.style.opacity = '1';
        window._colorScopeDraggedLayerId = null;
        $$('.layer-item').forEach(el => el.style.borderTop = el.style.borderBottom = '');
        
        // Execute the drop mutation SAFELY after all browser drag states have resolved
        if (window._colorScopePendingDrop) {
          const { dragId, dropId, placeBefore } = window._colorScopePendingDrop;
          window._colorScopePendingDrop = null;
          this.layerManager.moveLayer(dragId, dropId, placeBefore ? 'above' : 'below');
        }
      });
      item.addEventListener('dragenter', (e) => {
        e.preventDefault();
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        // Visual indicator
        const rect = item.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        $$('.layer-item').forEach(el => el.style.borderTop = el.style.borderBottom = '');
        if (e.clientY < mid) {
          item.style.borderTop = '2px solid var(--accent)';
        } else {
          item.style.borderBottom = '2px solid var(--accent)';
        }
      });
      item.addEventListener('dragleave', () => {
        item.style.borderTop = item.style.borderBottom = '';
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const dragId = window._colorScopeDraggedLayerId || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : null);
        if (dragId && String(dragId) !== String(layer.id)) {
          const rect = item.getBoundingClientRect();
          const placeBefore = e.clientY < (rect.top + rect.height / 2);
          
          // DO NOT MUTATE DOM HERE. The browser drag engine is still running!
          // Store the intent, and let `dragend` actually execute it safely.
          window._colorScopePendingDrop = { dragId, dropId: layer.id, placeBefore };
        }
      });

      item.addEventListener('click', () => {
        this.layerManager.setActiveLayer(layer.id);
        // Show properties for adjustment layers without auto-switching
        if (isAdjust) {
          this._renderAdjustLayerProps(layer, false);
        } else {
          this._clearPropertyPanel();
        }
      });
      list.appendChild(item);
    }

    this._syncPropertyPanelWithActiveLayer();
  }

  _syncPropertyPanelWithActiveLayer() {
    if (this.toolManager?.activeTool === 'brush' || this.toolManager?.activeTool === 'eraser') {
      this._renderBrushProps(this.toolManager.activeTool);
      return;
    }

    const active = this.layerManager.getActiveLayer();
    if (active && active.type === 'adjustment') {
      this._renderAdjustLayerProps(active, false);
      return;
    }

    if (this._propertyPanelState.type === 'adjustment' || this._propertyPanelState.type === 'brush') {
      this._clearPropertyPanel();
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

  async _doExport() {
    const format = $('.format-btn.active')?.dataset.format || 'png';
    const source = $('#export-source')?.value || 'display';
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
    } else if (source === 'display') {
      const comp = this.canvasEngine.getCompositeImageData();
      if (comp) baseCtx.putImageData(comp, 0, 0);
      else baseCtx.drawImage(img, 0, 0);
    } else {
      // Apply filter to raw imageData
      const src = imageData;
      const w = src.width, h = src.height;
      const dst = baseCtx.createImageData(w, h);
      const sd = src.data, dd = dst.data;
      
      // We may need saturationHeatColor
      let satColorFn = null;
      if (source === 'saturation') {
        const { saturationHeatColor } = await import('./core/ColorMath.js');
        satColorFn = saturationHeatColor;
      }

      for (let i = 0; i < sd.length; i += 4) {
        const r = sd[i], g = sd[i+1], b = sd[i+2], a = sd[i+3];
        if (source === 'grayscale') {
          const gray = Math.round(0.299*r + 0.587*g + 0.114*b);
          dd[i]=gray; dd[i+1]=gray; dd[i+2]=gray; dd[i+3]=a;
        } else if (source === 'saturation') {
          const max = Math.max(r,g,b), min = Math.min(r,g,b);
          const sat = max === 0 ? 0 : ((max-min)/max) * 100;
          const [hr, hg, hb] = satColorFn(sat);
          dd[i]=hr; dd[i+1]=hg; dd[i+2]=hb; dd[i+3]=a;
        } else if (source === 'hue' || source === 'analogous' || source === 'complementary') {
          const max2=Math.max(r,g,b), min2=Math.min(r,g,b), d2=max2-min2;
          let hue=0;
          if(d2>0){
            if(max2===r) hue=((g-b)/d2+(g<b?6:0))/6*360;
            else if(max2===g) hue=((b-r)/d2+2)/6*360;
            else hue=((r-g)/d2+4)/6*360;
          }
          
          let inR = false;
          if (source === 'hue') {
            const { hueStart: hs, hueEnd: he } = this._getFilterRange('hue');
            inR = hs <= he ? (hue >= hs && hue <= he) : (hue >= hs || hue <= he);
          } else {
            const { hueStart: start, hueEnd: end } = this._getFilterRange(source);
            inR = start <= end ? (hue >= start && hue <= end) : (hue >= start || hue <= end);
          }
          
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
      const exportScale = this.canvasEngine.scale ? 1 / this.canvasEngine.scale : 1.0;
      this.canvasEngine.renderObjectsToContext(baseCtx, 1, 0, 0, { width: img.width, height: img.height, exportScale });
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

    // --- Legend strip (for saturation/grayscale) ---
    if (source === 'saturation' || source === 'grayscale') {
      const stripH = 20;
      const sectionH = panelPad + stripH + panelPad;
      sections.push({ height: sectionH, draw: async (ctx, y) => {
        ctx.fillStyle = panelBg;
        ctx.fillRect(0, y, panelW, sectionH);
        
        ctx.font = panelFontBold;
        ctx.fillStyle = panelText;
        ctx.textAlign = 'left';
        ctx.fillText(source === 'saturation' ? '飽和度熱圖 (0% - 100%)' : '灰階明度 (0% - 100%)', panelPad, y + panelPad + 14);
        
        const gradX = panelPad + 180;
        const gradW = panelW - gradX - panelPad;
        const gradY = y + panelPad;
        
        const grad = ctx.createLinearGradient(gradX, 0, gradX + gradW, 0);
        if (source === 'grayscale') {
          grad.addColorStop(0, '#000000');
          grad.addColorStop(1, '#ffffff');
        } else {
          // Saturation
          const { saturationHeatColor } = await import('./core/ColorMath.js');
          for (let i = 0; i <= 20; i++) {
            const pct = i * 5;
            const [r, g, b] = saturationHeatColor(pct);
            grad.addColorStop(i / 20, `rgb(${r},${g},${b})`);
          }
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(gradX, gradY, gradW, stripH, 4);
        ctx.fill();
        
        // Min/Max labels
        ctx.font = panelFontSmall;
        ctx.fillStyle = source === 'grayscale' ? '#888' : '#fff';
        ctx.textAlign = 'left';
        ctx.fillText('0%', gradX + 6, gradY + 14);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#000';
        ctx.fillText('100%', gradX + gradW - 6, gradY + 14);
        ctx.textAlign = 'left'; // reset
      }});
      extraH += sectionH;
    }

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
      // For analysis mode, compose a 3x2 grid + panels
      const cols = 3;
      const rows = 2;
      const cellW = Math.ceil(img.width / cols);
      const cellH = Math.ceil(img.height / rows);
      const gridW = cellW * cols;
      const gridH = cellH * rows;
      const labelBarH = 24;

      const ec = document.createElement('canvas');
      ec.width = gridW;
      ec.height = gridH + labelBarH * 2 + extraH;
      const ctx = ec.getContext('2d');

      const drawCell = (srcCanvas, col, row, label) => {
        const x = col * cellW;
        const y = row * cellH;
        const drawAreaX = x;
        const drawAreaY = y + labelBarH;
        const drawAreaW = cellW;
        const drawAreaH = Math.max(1, cellH - labelBarH);
        const srcW = Math.max(1, srcCanvas.width || 1);
        const srcH = Math.max(1, srcCanvas.height || 1);
        const scale = Math.min(drawAreaW / srcW, drawAreaH / srcH);
        const drawW = srcW * scale;
        const drawH = srcH * scale;
        const dx = drawAreaX + (drawAreaW - drawW) / 2;
        const dy = drawAreaY + (drawAreaH - drawH) / 2;

        // Keep aspect ratio to avoid squeezing in analysis export grid cells.
        ctx.fillStyle = '#0f1322';
        ctx.fillRect(x, y, cellW, cellH);
        ctx.drawImage(srcCanvas, dx, dy, drawW, drawH);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y, cellW, labelBarH);
        ctx.font = panelFontBold;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + cellW / 2, y + 16);
        ctx.textAlign = 'left';
      };

      const origC = document.createElement('canvas');
      origC.width = img.width; origC.height = img.height;
      origC.getContext('2d').drawImage(img, 0, 0);
      const grayC = this._applyFilterToCanvas(imageData, 'grayscale');
      const satC = this._applyFilterToCanvas(imageData, 'saturation');
      const hueC = this._applyFilterToCanvas(imageData, 'hue', { hueRange: this._getFilterRange('hue') });
      const anaC = this._applyFilterToCanvas(imageData, 'analogous', { hueRange: this._getFilterRange('analogous') });
      const cmpC = this._applyFilterToCanvas(imageData, 'complementary', { hueRange: this._getFilterRange('complementary') });

      drawCell(origC, 0, 0, '原圖 Original');
      drawCell(grayC, 1, 0, '灰階 Grayscale');
      drawCell(satC, 2, 0, '飽和度 Saturation');
      drawCell(hueC, 0, 1, '色相隔離 Hue');
      drawCell(anaC, 1, 1, '相似色 Analogous');
      drawCell(cmpC, 2, 1, '對比色 Complementary');

      // Panels
      let panelY = gridH;
      for (const sec of sections) {
        const res = sec.draw(ctx, panelY);
        if (res instanceof Promise) await res;
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
      const res = sec.draw(ctx, panelY);
      if (res instanceof Promise) await res;
      panelY += sec.height;
    }

    const link = document.createElement('a');
    link.download = `colorscope-${this._currentFileName || 'export'}.${format}`;
    link.href = ec.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
    link.click();
    hideModal('export-dialog');
  }

  /** Helper: apply a filter type to imageData and return a canvas */
  _applyFilterToCanvas(imageData, filterType, options = {}) {
    const hueRange = options.hueRange || this._getFilterRange(filterType);
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
        const sat = max === 0 ? 0 : ((max-min)/max) * 100;
        const [hr, hg, hb] = saturationHeatColor(sat);
        dd[i]=hr; dd[i+1]=hg; dd[i+2]=hb;
        dd[i+3]=a;
      } else if (filterType === 'hue' || filterType === 'analogous' || filterType === 'complementary') {
        const max2=Math.max(r,g,b), min2=Math.min(r,g,b), d2=max2-min2;
        let hue=0;
        if(d2>0){
          if(max2===r) hue=((g-b)/d2+(g<b?6:0))/6*360;
          else if(max2===g) hue=((b-r)/d2+2)/6*360;
          else hue=((r-g)/d2+4)/6*360;
        }
        const hs = hueRange?.hueStart ?? 0;
        const he = hueRange?.hueEnd ?? 60;
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
        state: data.state || existing?.state || null
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
