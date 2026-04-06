import { createElement } from '../utils/DOMUtils.js';

export class ComparisonDetailsModal {
  constructor() {
    this.modal = null;
  }

  show(comparisonObj) {
    this.close();
    
    // Create backdrop
    this.modal = createElement('div', { 
      className: 'modal-backdrop',
      style: {
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.2s ease-out'
      },
      onClick: (e) => {
        if (e.target === this.modal) this.close();
      }
    });

    const panel = createElement('div', {
      className: 'modal-panel',
      style: {
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-xl)',
        padding: '24px',
        width: '460px',
        display: 'flex', flexDirection: 'column', gap: '16px',
        animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }
    });

    const header = createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }});
    header.appendChild(createElement('h3', { textContent: '色彩對比詳細資料', style: { margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}));
    
    const actionsBox = createElement('div', { style: { display: 'flex', gap: '8px' }});

    if (comparisonObj.id) {
      const delBtn = createElement('div', {
        innerHTML: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        style: { color: '#f43f5e', cursor: 'pointer', padding: '4px', borderRadius: '4px' },
        onMouseEnter: (e) => e.currentTarget.style.backgroundColor = 'rgba(244,63,94,0.1)',
        onMouseLeave: (e) => e.currentTarget.style.backgroundColor = 'transparent',
        onClick: () => {
          if (window.app?.layerManager) {
            window.app.layerManager.removeObjectFromAny(comparisonObj.id);
            window.app.canvasEngine.render();
            import('../utils/EventBus.js').then(m => m.bus.emit('layers:objects-changed'));
          }
          this.close();
        }
      });
      actionsBox.appendChild(delBtn);
    }

    actionsBox.appendChild(createElement('div', {
      innerHTML: '&times;', style: { fontSize: '24px', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0 4px' },
      onClick: () => this.close()
    }));
    
    header.appendChild(actionsBox);

    // Content: 2 Columns side-by-side
    const twocol = createElement('div', { style: { display: 'flex', gap: '16px' }});

    const createColorCol = (data, title) => {
      const col = createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }});
      
      const cName = data.hsl.h ? '有顏色的' : '灰色'; // Since we don't import colorName directly here, or we can just show Hex
      const hex = (data.hex || '').toUpperCase();

      // Swatch
      col.appendChild(createElement('div', {
        style: {
          width: '100%', height: '60px', borderRadius: 'var(--radius-md)',
          backgroundColor: hex, border: '2px solid rgba(255,255,255,0.1)'
        }
      }));
      
      // Basic info
      col.appendChild(createElement('div', { textContent: `${title} (${hex})`, style: { fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)', textAlign: 'center' }}));

      // SV Map
      const hsv = data.hsv;
      const svBox = createElement('div', {
        style: {
          position: 'relative', width: '100%', height: '100px', borderRadius: 'var(--radius-sm)',
          backgroundColor: `hsl(${data.hsl.h}, 100%, 50%)`, overflow: 'hidden',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)'
        }
      });
      svBox.appendChild(createElement('div', { style: { position: 'absolute', inset: 0, background: 'linear-gradient(to right, #fff, rgba(255,255,255,0))' }}));
      svBox.appendChild(createElement('div', { style: { position: 'absolute', inset: 0, background: 'linear-gradient(to top, #000, rgba(0,0,0,0))' }}));
      
      svBox.appendChild(createElement('div', {
        style: {
          position: 'absolute', left: `${hsv.s}%`, top: `${100 - hsv.v}%`,
          transform: 'translate(-50%, -50%)', width: '12px', height: '12px', borderRadius: '50%',
          backgroundColor: hex, border: '1px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
        }
      }));
      col.appendChild(svBox);

      // Hue indicator
      const hBox = createElement('div', {
        style: {
          position: 'relative', width: '100%', height: '12px', borderRadius: '6px',
          background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
          marginTop: '4px'
        }
      });
      hBox.appendChild(createElement('div', {
        style: {
          position: 'absolute', left: `${hsv.h / 360 * 100}%`, top: '50%',
          transform: 'translate(-50%, -50%)', width: '8px', height: '16px', borderRadius: '4px',
          backgroundColor: '#fff', border: '1px solid #000', boxShadow: '0 1px 2px rgba(0,0,0,0.3)'
        }
      }));
      col.appendChild(hBox);

      // Data list
      const list = createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg-elevated)', padding: '8px', borderRadius: 'var(--radius-sm)' }});
      const addLine = (lbl, val) => {
        const l = createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' }});
        l.appendChild(createElement('span', { textContent: lbl, style: { color: 'var(--text-tertiary)' }}));
        l.appendChild(createElement('span', { textContent: val, style: { color: 'var(--text-primary)', fontFamily: 'monospace' }}));
        list.appendChild(l);
      };
      addLine('RGB', `${data.r}, ${data.g}, ${data.b}`);
      addLine('HSV', `${hsv.h}°, ${hsv.s}%, ${hsv.v}%`);
      addLine('亮度 (Perceived)', `${data.brightness}%`);
      col.appendChild(list);

      return col;
    };

    twocol.appendChild(createColorCol(comparisonObj.start, '顏色 A'));
    twocol.appendChild(createColorCol(comparisonObj.end, '顏色 B'));

    // Delta Summary Box
    const deltaBox = createElement('div', {
      style: { background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', justifyContent: 'space-around' }
    });
    
    const d = comparisonObj.delta;
    const db = comparisonObj.dBright;
    
    const addDelta = (lbl, val) => {
      const item = createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' }});
      item.appendChild(createElement('div', { textContent: lbl, style: { fontSize: '11px', color: 'var(--text-secondary)' }}));
      item.appendChild(createElement('div', { textContent: val, style: { fontSize: '15px', fontWeight: 'bold', color: 'var(--accent)' }}));
      deltaBox.appendChild(item);
    };

    addDelta('亮度差 (肉眼)', `${db}%`);
    addDelta('Δ 明度 (Lightness)', d.deltaL);
    addDelta('Δ 色相 (Hue)', d.deltaH + '°');
    addDelta('Δ 飽和 (Sat)', d.deltaS);

    panel.appendChild(header);
    panel.appendChild(twocol);
    panel.appendChild(deltaBox);

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

export const comparisonDetailsModal = new ComparisonDetailsModal();
