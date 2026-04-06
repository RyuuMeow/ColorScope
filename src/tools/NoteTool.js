/**
 * NoteTool — Click to place notes on canvas. Editing via MoveTool double-click.
 */
import { bus } from '../utils/EventBus.js';
import { $, createElement } from '../utils/DOMUtils.js';
import { NoteObject } from '../core/CanvasObject.js';

export class NoteTool {
  constructor(canvasEngine, layerManager) {
    this.engine = canvasEngine;
    this.layers = layerManager;
    this._setup();
  }

  _setup() {
    const container = $('#canvas-container');

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || bus._currentTool !== 'note') return;
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(e.clientX - rect.left, e.clientY - rect.top);
      // Select existing object if clicking on one
      const hit = this.layers.getObjectAt(imgX, imgY, this.engine.scale);
      if (hit) {
        this.layers.deselectAll();
        hit.selected = true;
        this.engine.render();
        return;
      }
      this._createNoteWithEditor(imgX, imgY);
    });

    container.addEventListener('touchend', (e) => {
      if (bus._currentTool !== 'note' || e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const rect = container.getBoundingClientRect();
      const { imgX, imgY } = this.engine.screenToImage(touch.clientX - rect.left, touch.clientY - rect.top);
      this._createNoteWithEditor(imgX, imgY);
    });

    bus.on('contextmenu:action', ({ action, data }) => {
      if (action === 'delete-note') this.layers.removeObject(data.noteId);
    });

    $('#btn-clear-notes')?.addEventListener('click', () => {
      for (const layer of this.layers.layers) {
        layer.objects = layer.objects.filter(o => o.type !== 'note');
      }
      this.engine.render();
      bus.emit('layers:objects-changed');
    });
  }

  _createNoteWithEditor(imgX, imgY) {
    const note = new NoteObject(imgX, imgY, '', '#fbbf24');
    this.layers.addObject(note);
    this.engine.render();

    // Open inline editor immediately
    const { sx, sy } = this.engine.imageToScreen(imgX, imgY);
    const container = $('#canvas-container');

    const panel = createElement('div', { className: 'inline-note-editor', style: { position: 'absolute', left: (sx + 15) + 'px', top: (sy - 10) + 'px', zIndex: 60 } });
    const textarea = createElement('textarea', { className: 'inline-note-text' });
    textarea.setAttribute('placeholder', '輸入筆記...');
    const colors = createElement('div', { className: 'inline-note-colors' });
    const noteColors = ['#fbbf24', '#fb923c', '#f43f5e', '#22c55e', '#3b82f6', '#d4d4d8'];
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

    const save = () => {
      const text = textarea.value.trim();
      if (!text) {
        this.layers.removeObject(note.id);
      } else {
        note.text = text;
      }
      panel.remove();
      this.engine.render();
      bus.emit('layers:objects-changed');
    };

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
      if (e.key === 'Escape') { this.layers.removeObject(note.id); panel.remove(); this.engine.render(); }
    });

    setTimeout(() => {
      const handler = (e) => {
        if (!panel.contains(e.target)) { save(); window.removeEventListener('mousedown', handler); }
      };
      window.addEventListener('mousedown', handler);
    }, 100);
  }

  // Compatibility
  getNotes() { return this.layers.getAllObjectsByType('note'); }
}
