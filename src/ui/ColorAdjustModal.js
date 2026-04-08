import { $, showModal, hideModal } from '../utils/DOMUtils.js';
import { bus } from '../utils/EventBus.js';

export class ColorAdjustModal {
  constructor() {
    this._initialized = false;
    this.params = {
      brightness: 0, // -100 to 100
      contrast: 0,   // -100 to 100
      hue: 0,        // -180 to 180
      saturation: 0, // -100 to 100
      levelsMin: 0,  // 0 to 255
      levelsMid: 1,  // 0.1 to 10.0 (gamma)
      levelsMax: 255 // 0 to 255
    };
  }

  show() {
    if (!this._initialized) {
      this._initDOM();
      this._bindEvents();
      this._initialized = true;
    }
    showModal('color-adjust-modal');
  }

  _initDOM() {
    const html = `
      <div id="color-adjust-modal" class="modal-overlay hidden">
        <div class="modal adjust-modal">
          <div class="modal-header">
            <h2>色彩調整 (Color Adjustments)</h2>
            <button class="modal-close" id="adjust-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="modal-body" style="padding-top: 10px;">
            
            <div class="adjust-group" style="margin-bottom: 24px;">
              <h4 style="margin-bottom:8px; color:var(--text-secondary); font-size:12px; text-transform:uppercase;">基礎 (HSL)</h4>
              
              <label style="display:block; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                  <span>色相 (Hue)</span><span id="adj-val-hue" style="color:var(--text-tertiary);">0</span>
                </div>
                <input type="range" id="adj-hue" min="-180" max="180" value="0" style="width:100%;">
              </label>

              <label style="display:block; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                  <span>飽和度 (Saturation)</span><span id="adj-val-sat" style="color:var(--text-tertiary);">0</span>
                </div>
                <input type="range" id="adj-sat" min="-100" max="100" value="0" style="width:100%;">
              </label>

              <label style="display:block;">
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                  <span>明度 (Lightness)</span><span id="adj-val-bri" style="color:var(--text-tertiary);">0</span>
                </div>
                <input type="range" id="adj-bri" min="-100" max="100" value="0" style="width:100%;">
              </label>
            </div>

            <div class="adjust-group" style="margin-bottom: 24px;">
              <h4 style="margin-bottom:8px; color:var(--text-secondary); font-size:12px; text-transform:uppercase;">對比與色階 (Levels & Contrast)</h4>
              
              <label style="display:block; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                  <span>對比度 (Contrast)</span><span id="adj-val-con" style="color:var(--text-tertiary);">0</span>
                </div>
                <input type="range" id="adj-con" min="-100" max="100" value="0" style="width:100%;">
              </label>

              <label style="display:block; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                  <span>黑點 (Black Point)</span><span id="adj-val-min" style="color:var(--text-tertiary);">0</span>
                </div>
                <input type="range" id="adj-min" min="0" max="255" value="0" style="width:100%;">
              </label>

              <label style="display:block;">
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                  <span>白點 (White Point)</span><span id="adj-val-max" style="color:var(--text-tertiary);">255</span>
                </div>
                <input type="range" id="adj-max" min="0" max="255" value="255" style="width:100%;">
              </label>
            </div>

          </div>
          <div class="modal-actions" style="display:flex; justify-content:space-between; border-top:1px solid var(--border-subtle); padding-top:16px;">
            <button class="btn btn-secondary" id="btn-adj-reset">全部重置</button>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-secondary" id="btn-adj-cancel">取消</button>
              <button class="btn btn-primary" id="btn-adj-apply">套用</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  _bindEvents() {
    $('#adjust-close').addEventListener('click', () => this._cancel());
    $('#btn-adj-cancel').addEventListener('click', () => this._cancel());
    
    $('#btn-adj-reset').addEventListener('click', () => {
      this._reset();
    });

    $('#btn-adj-apply').addEventListener('click', () => {
      // Hard apply to the base image (usually requires editing the raw pixel data permanently)
      bus.emit('image:adjust:commit', this.params);
      hideModal('color-adjust-modal');
    });

    const bindSlider = (id, paramKey, displayId) => {
      const el = $(id);
      const disp = $(displayId);
      el.addEventListener('input', () => {
        const val = parseFloat(el.value);
        disp.textContent = val;
        this.params[paramKey] = val;
        this._preview();
      });
    };

    bindSlider('#adj-hue', 'hue', '#adj-val-hue');
    bindSlider('#adj-sat', 'saturation', '#adj-val-sat');
    bindSlider('#adj-bri', 'brightness', '#adj-val-bri');
    bindSlider('#adj-con', 'contrast', '#adj-val-con');
    bindSlider('#adj-min', 'levelsMin', '#adj-val-min');
    bindSlider('#adj-max', 'levelsMax', '#adj-val-max');
  }

  _preview() {
    bus.emit('image:adjust:preview', this.params);
  }

  _reset() {
    $('#adj-hue').value = 0; $('#adj-val-hue').textContent = '0'; this.params.hue = 0;
    $('#adj-sat').value = 0; $('#adj-val-sat').textContent = '0'; this.params.saturation = 0;
    $('#adj-bri').value = 0; $('#adj-val-bri').textContent = '0'; this.params.brightness = 0;
    $('#adj-con').value = 0; $('#adj-val-con').textContent = '0'; this.params.contrast = 0;
    $('#adj-min').value = 0; $('#adj-val-min').textContent = '0'; this.params.levelsMin = 0;
    $('#adj-max').value = 255; $('#adj-val-max').textContent = '255'; this.params.levelsMax = 255;
    this._preview();
  }

  _cancel() {
    hideModal('color-adjust-modal');
    this._reset();
  }
}

export const colorAdjustModal = new ColorAdjustModal();
