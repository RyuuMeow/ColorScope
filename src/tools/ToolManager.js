/**
 * ToolManager — Manages active tool state, keyboard shortcuts, and cursor
 */
import { bus } from '../utils/EventBus.js';
import { $, $$ } from '../utils/DOMUtils.js';

export class ToolManager {
  constructor() {
    this.activeTool = 'move';
    bus._currentTool = 'move';
    this.activeFilters = new Set();
    this._tempHandPrevTool = null;
    this._setup();
  }

  _setup() {
    $$('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });

    $$('.tool-btn[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => this.toggleFilter(btn.dataset.filter));
    });

    window.addEventListener('keydown', (e) => {
      if (this._isTextEntryActive()) return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this._activateTemporaryHand();
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'v': this.setTool('move'); break;
        case 'q': this.setTool('select'); break;
        case 'b': this.setTool('brush'); break;
        case 'e': this.setTool('eraser'); break;
        case 'z': if (!e.ctrlKey) this.setTool('hand'); break;
        case 'p': this.setTool('pin'); break;
        case 'c': this.setTool('compare'); break;
        case 'r': this.setTool('region'); break;
        case 'n': this.setTool('note'); break;
        case 'w': this.setTool('analogous_wand'); break;
        case 'x': this.setTool('complementary_wand'); break;
        case 'g': this.toggleFilter('grayscale'); break;
        case 's': if (!e.ctrlKey) this.toggleFilter('saturation'); break;
        case 'h': this.toggleFilter('hue'); break;
        case 'a': this.toggleFilter('analogous'); break;
        case 'd': this.toggleFilter('complementary'); break;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code !== 'Space') return;
      this._deactivateTemporaryHand();
    });

    // Set default active
    this._updateUI();
  }

  setTool(toolName) {
    const prev = this.activeTool;
    this.activeTool = toolName;
    bus._currentTool = toolName;
    if (this._tempHandPrevTool && toolName !== 'hand') {
      this._tempHandPrevTool = toolName;
    }
    this._updateUI();
    bus.emit('tool:changed', { tool: toolName, prev });
  }

  _activateTemporaryHand() {
    if (this._tempHandPrevTool || this.activeTool === 'hand') return;
    this._tempHandPrevTool = this.activeTool;
    this.setTool('hand');
  }

  _deactivateTemporaryHand() {
    if (!this._tempHandPrevTool) return;
    const restoreTool = this._tempHandPrevTool;
    this._tempHandPrevTool = null;
    if (this.activeTool === 'hand') {
      this.setTool(restoreTool);
    }
  }

  _isTextEntryActive() {
    const active = document.activeElement;
    if (!active) return false;
    if (['TEXTAREA', 'INPUT', 'SELECT'].includes(active.tagName)) return true;
    return Boolean(active.closest?.('[contenteditable="true"]'));
  }

  _updateUI() {
    $$('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === this.activeTool);
    });
    this._updateCursor();
  }

  toggleFilter(filterName) {
    const btn = $(`.tool-btn[data-filter="${filterName}"]`);
    if (!btn) return;

    if (this.activeFilters.has(filterName)) {
      this.activeFilters.delete(filterName);
      btn.classList.remove('filter-active');
      bus.emit('filter:clear');
      bus.emit('filter:props-clear');
    } else {
      this.activeFilters.forEach(f => {
        $(`.tool-btn[data-filter="${f}"]`)?.classList.remove('filter-active');
      });
      this.activeFilters.clear();
      this.activeFilters.add(filterName);
      btn.classList.add('filter-active');
      
      // Filters that need property panel controls
      if (filterName === 'hue' || filterName === 'analogous' || filterName === 'complementary') {
        bus.emit('filter:show-props', { filterName });
      } else {
        bus.emit('filter:props-clear');
        bus.emit('filter:apply', { type: filterName });
      }
    }
  }

  _updateCursor() {
    const container = $('#canvas-container');
    if (!container) return;
    const classes = ['cursor-select', 'cursor-default', 'cursor-hand', 'cursor-pin', 'cursor-region', 'cursor-note', 'cursor-compare', 'cursor-brush', 'cursor-eraser'];
    container.classList.remove(...classes);
    const map = {
      select: 'cursor-select', move: 'cursor-default', hand: 'cursor-hand',
      pin: 'cursor-pin', region: 'cursor-region', note: 'cursor-note',
      compare: 'cursor-compare', brush: 'cursor-brush', eraser: 'cursor-eraser'
    };
    if (map[this.activeTool]) container.classList.add(map[this.activeTool]);
  }
}
