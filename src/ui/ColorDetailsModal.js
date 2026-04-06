import { createElement } from '../utils/DOMUtils.js';
import { colorName } from '../core/ColorMath.js';

export class ColorDetailsModal {
  constructor() {
    this.modal = null;
  }

  show(colorData) {
    this.close();
    
    // Create backdrop
    this.modal = createElement('div', { 
      className: 'modal-backdrop',
      style: {
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000,
        animation: 'fadeIn 0.2s ease-out'
      },
      onClick: (e) => {
        if (e.target === this.modal) this.close();
      }
    });

    const cName = colorName(colorData.hsl.h, colorData.hsl.s, colorData.hsl.l);
    const hex = (colorData.hex || '').toUpperCase();

    const panel = createElement('div', {
      className: 'modal-panel',
      style: {
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-xl)',
        padding: '24px',
        width: '320px',
        display: 'flex', flexDirection: 'column', gap: '16px',
        animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }
    });

    // Header (Color Swatch + Name)
    const header = createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' }});
    const swatch = createElement('div', {
      style: {
        width: '48px', height: '48px', borderRadius: '50%',
        backgroundColor: hex,
        border: '2px solid rgba(255,255,255,0.1)'
      }
    });
    const titleBox = createElement('div', { style: { flex: 1 }});
    titleBox.appendChild(createElement('div', { textContent: cName, style: { fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}));
    titleBox.appendChild(createElement('div', { textContent: hex, style: { fontSize: '14px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}));
    
    const actionsBox = createElement('div', { style: { display: 'flex', gap: '8px' }});

    if (colorData.id) {
      const delBtn = createElement('div', {
        innerHTML: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        style: { color: '#f43f5e', cursor: 'pointer', padding: '4px', borderRadius: '4px' },
        onMouseEnter: (e) => e.currentTarget.style.backgroundColor = 'rgba(244,63,94,0.1)',
        onMouseLeave: (e) => e.currentTarget.style.backgroundColor = 'transparent',
        onClick: () => {
          if (window.app?.layerManager) {
            window.app.layerManager.removeObjectFromAny(colorData.id);
            window.app.canvasEngine.render();
            import('../utils/EventBus.js').then(m => m.bus.emit('layers:objects-changed'));
          }
          this.close();
        }
      });
      actionsBox.appendChild(delBtn);
    }

    const closeBtn = createElement('div', {
      innerHTML: '&times;',
      style: { fontSize: '24px', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0 4px' },
      onClick: () => this.close()
    });
    actionsBox.appendChild(closeBtn);

    header.appendChild(swatch);
    header.appendChild(titleBox);
    header.appendChild(actionsBox);

    // Data grid
    const grid = createElement('div', {
      style: {
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
        background: 'var(--bg-elevated)', padding: '12px', borderRadius: 'var(--radius-md)'
      }
    });

    const addStat = (label, val) => {
      const item = createElement('div');
      item.appendChild(createElement('div', { textContent: label, style: { fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}));
      item.appendChild(createElement('div', { textContent: val, style: { fontSize: '14px', fontFamily: 'monospace', color: 'var(--text-primary)' }}));
      grid.appendChild(item);
    };

    addStat('RGB', `${colorData.r}, ${colorData.g}, ${colorData.b}`);
    addStat('HSV', `${colorData.hsv.h}°, ${colorData.hsv.s}%, ${colorData.hsv.v}%`);
    addStat('HSL', `${colorData.hsl.h}°, ${colorData.hsl.s}%, ${colorData.hsl.l}%`);
    addStat('感知亮度 (Perceived)', `${colorData.brightness}% - ${colorData.brightLabel}`);
    
    // --- 2D SV Map (Saturation/Value) ---
    const hsv = colorData.hsv;
    const svBox = createElement('div', {
      style: {
        position: 'relative', width: '100%', height: '140px', borderRadius: 'var(--radius-sm)',
        backgroundColor: `hsl(${colorData.hsl.h}, 100%, 50%)`, overflow: 'hidden', marginTop: '4px',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)'
      }
    });
    // White gradient from left (S=0) to right (S=100)
    svBox.appendChild(createElement('div', { style: { position: 'absolute', inset: 0, background: 'linear-gradient(to right, #fff, rgba(255,255,255,0))' }}));
    // Black gradient from bottom (V=0) to top (V=100)
    svBox.appendChild(createElement('div', { style: { position: 'absolute', inset: 0, background: 'linear-gradient(to top, #000, rgba(0,0,0,0))' }}));
    
    // SV Marker
    const px = hsv.s;
    const py = 100 - hsv.v;
    svBox.appendChild(createElement('div', {
      style: {
        position: 'absolute', left: `${Math.max(2, Math.min(98, px))}%`, top: `${Math.max(2, Math.min(98, py))}%`,
        transform: 'translate(-50%, -50%)', width: '14px', height: '14px', borderRadius: '50%',
        backgroundColor: hex, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.5)'
      }
    }));

    // --- 1D Hue Slider ---
    const hueBox = createElement('div', {
      style: {
        position: 'relative', width: '100%', height: '16px', borderRadius: '8px', marginTop: '12px',
        background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)'
      }
    });

    const hx = (hsv.h / 360) * 100;
    hueBox.appendChild(createElement('div', {
      style: {
        position: 'absolute', left: `${hx}%`, top: '50%', transform: 'translate(-50%, -50%)',
        width: '16px', height: '16px', borderRadius: '50%',
        backgroundColor: `hsl(${hsv.h}, 100%, 50%)`, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
      }
    }));

    panel.appendChild(header);
    panel.appendChild(grid);
    
    const vizLabel = createElement('div', { textContent: 'HSV 色板位置', style: { fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }});
    panel.appendChild(vizLabel);
    panel.appendChild(svBox);
    panel.appendChild(hueBox);

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

export const colorDetailsModal = new ColorDetailsModal();
