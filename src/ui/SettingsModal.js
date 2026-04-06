import { createElement } from '../utils/DOMUtils.js';
import { bus } from '../utils/EventBus.js';

let _uiScale = Number(localStorage.getItem('cs_ui_scale')) || 1.0;
let _crossLayerEnabled = localStorage.getItem('cs_cross_layer') === 'true';

export function getUIScale() {
  return _uiScale;
}

export function setUIScale(scale) {
  _uiScale = scale;
  localStorage.setItem('cs_ui_scale', scale.toString());
  bus.emit('settings:changed');
}

export function getCrossLayer() {
  return _crossLayerEnabled;
}

export function setCrossLayer(enabled) {
  _crossLayerEnabled = enabled;
  localStorage.setItem('cs_cross_layer', enabled.toString());
  bus.emit('settings:changed');
}

export class SettingsModal {
  constructor() {
    this.modal = null;
  }

  show() {
    this.close();
    
    this.modal = createElement('div', {
      className: 'modal-backdrop',
      style: {
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, animation: 'fadeIn 0.2s ease-out'
      },
      onClick: (e) => {
        if (e.target === this.modal) this.close();
      }
    });

    const panel = createElement('div', {
      className: 'modal-panel',
      style: {
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)', padding: '24px', width: '320px',
        border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-xl)',
        display: 'flex', flexDirection: 'column', gap: '20px',
        animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }
    });

    const header = createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }});
    header.appendChild(createElement('h3', { textContent: '設定 Settings', style: { margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}));
    header.appendChild(createElement('div', {
      innerHTML: '&times;', style: { fontSize: '24px', color: 'var(--text-tertiary)', cursor: 'pointer' },
      onClick: () => this.close()
    }));

    // UI Scale Setup
    const scaleGroup = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' }});
    scaleGroup.appendChild(createElement('label', { textContent: '標籤與資訊大小 (UI Scale)', style: { fontSize: '12px', color: 'var(--text-secondary)' }}));
    
    const scaleOptions = [
      { label: '小', value: 0.8 },
      { label: '中 (預設)', value: 1.0 },
      { label: '大', value: 1.25 },
      { label: '特大', value: 1.5 }
    ];
    
    const scaleSelect = createElement('div', { style: { display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '4px' }});
    
    scaleOptions.forEach(opt => {
      const btn = createElement('button', {
        className: 'scale-btn',
        textContent: opt.label,
        style: {
          flex: 1, padding: '6px 0', fontSize: '12px', border: 'none', borderRadius: '4px', cursor: 'pointer',
          background: _uiScale === opt.value ? 'var(--accent)' : 'transparent',
          color: _uiScale === opt.value ? '#fff' : 'var(--text-primary)',
          transition: 'all 0.2s'
        },
        onClick: () => {
          setUIScale(opt.value);
          Array.from(scaleSelect.children).forEach(c => {
            c.style.background = 'transparent'; c.style.color = 'var(--text-primary)';
          });
          btn.style.background = 'var(--accent)'; btn.style.color = '#fff';
        }
      });
      scaleSelect.appendChild(btn);
    });

    scaleGroup.appendChild(scaleSelect);
    
    // Cross Layer Setup
    const crossLayerGroup = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }});
    const clLabel = createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px' }});
    const clCheckbox = createElement('input', { type: 'checkbox', checked: _crossLayerEnabled, style: { width: '16px', height: '16px', accentColor: 'var(--accent)' }});
    clCheckbox.addEventListener('change', (e) => setCrossLayer(e.target.checked));
    clLabel.appendChild(clCheckbox);
    clLabel.appendChild(document.createTextNode('跨圖層編輯 (Cross-Layer Edit)'));
    crossLayerGroup.appendChild(clLabel);
    
    const clHint = createElement('div', { textContent: '啟用後，所有顯示中的圖層物件皆可被選取與移動。', style: { fontSize: '11px', color: 'var(--text-tertiary)' }});
    crossLayerGroup.appendChild(clHint);

    const hint = createElement('div', { textContent: '調整標籤大小會即時套用到畫布上的所有物件', style: { fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' }});

    panel.appendChild(header);
    panel.appendChild(scaleGroup);
    panel.appendChild(crossLayerGroup);
    panel.appendChild(hint);
    this.modal.appendChild(panel);
    document.body.appendChild(this.modal);
  }

  close() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }
}

export const settingsModal = new SettingsModal();
