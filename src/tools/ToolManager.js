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
      if (['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) return;
      switch (e.key.toLowerCase()) {
        case 'v': this.setTool('move'); break;
        case 'q': this.setTool('select'); break;
        case 'z': if (!e.ctrlKey) this.setTool('hand'); break;
        case 'p': this.setTool('pin'); break;
        case 'c': this.setTool('compare'); break;
        case 'r': this.setTool('region'); break;
        case 'n': this.setTool('note'); break;
        case 'g': this.toggleFilter('grayscale'); break;
        case 's': if (!e.ctrlKey) this.toggleFilter('saturation'); break;
        case 'h': this.toggleFilter('hue'); break;
      }
    });

    // Set default active
    this._updateUI();
  }

  setTool(toolName) {
    const prev = this.activeTool;
    this.activeTool = toolName;
    bus._currentTool = toolName;
    this._updateUI();
    bus.emit('tool:changed', { tool: toolName, prev });
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
    } else {
      this.activeFilters.forEach(f => {
        $(`.tool-btn[data-filter="${f}"]`)?.classList.remove('filter-active');
      });
      this.activeFilters.clear();
      this.activeFilters.add(filterName);
      btn.classList.add('filter-active');
      if (filterName === 'hue') bus.emit('filter:hue-dialog');
      else bus.emit('filter:apply', { type: filterName });
    }
  }

  _updateCursor() {
    const container = $('#canvas-container');
    if (!container) return;
    const classes = ['cursor-select', 'cursor-move', 'cursor-hand', 'cursor-pin', 'cursor-region', 'cursor-note', 'cursor-compare'];
    container.classList.remove(...classes);
    const map = {
      select: 'cursor-select', move: 'cursor-move', hand: 'cursor-hand',
      pin: 'cursor-pin', region: 'cursor-region', note: 'cursor-note',
      compare: 'cursor-compare'
    };
    if (map[this.activeTool]) container.classList.add(map[this.activeTool]);
  }
}
