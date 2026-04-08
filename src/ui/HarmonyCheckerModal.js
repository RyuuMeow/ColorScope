import { $, createElement, showModal, hideModal } from '../utils/DOMUtils.js';
import { bus } from '../utils/EventBus.js';

export class HarmonyCheckerModal {
  constructor() {
    this._initialized = false;
    this.baseHue = 0;
    this.tolerance = 30; // degrees
    this.mode = 'analogous'; // 'analogous' | 'complementary' | 'triadic'
  }

  show() {
    if (!this._initialized) {
      this._initDOM();
      this._bindEvents();
      this._initialized = true;
    }
    showModal('harmony-checker-modal');
    this._updateVisuals();
  }

  _initDOM() {
    const html = `
      <div id="harmony-checker-modal" class="modal-overlay hidden">
        <div class="modal harmony-modal">
          <div class="modal-header">
            <h2>色彩和諧度檢查器 (Color Harmony Checker)</h2>
            <button class="modal-close" id="harmony-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="modal-body" style="padding-top: 10px;">
            <div style="display:flex; gap:8px; margin-bottom: 20px;">
              <button class="btn btn-secondary active" id="btn-mode-analogous" style="flex:1;">相似色 (Analogous)</button>
              <button class="btn btn-secondary" id="btn-mode-complementary" style="flex:1;">對比色 (Complementary)</button>
            </div>
            
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
              選擇一個基準色相，工具將在畫面上高亮符合特定和諧關係的像素。
            </p>

            <div style="display:flex; flex-direction:column; gap:16px;">
              <label>
                <div style="display:flex; justify-content:space-between;">
                  <span>基準色相 (Base Hue): <span id="harmony-base-val">0°</span></span>
                </div>
                <input type="range" id="harmony-base-hue" min="0" max="360" value="0" style="width:100%; margin-top:8px;">
                <div id="harmony-color-preview" style="height:24px; border-radius:4px; margin-top:8px; background:hsl(0, 100%, 50%); border:1px solid rgba(255,255,255,0.1);"></div>
              </label>

              <label>
                <div style="display:flex; justify-content:space-between;">
                  <span>容差角度 (Tolerance): <span id="harmony-tol-val">±30°</span></span>
                </div>
                <input type="range" id="harmony-tolerance" min="5" max="90" value="30" style="width:100%; margin-top:8px;">
              </label>
            </div>
          </div>
          <div class="modal-actions" style="margin-top:24px; display:flex; justify-content:flex-end; gap:12px;">
            <button class="btn btn-secondary" id="btn-harmony-clear">清除效果</button>
            <button class="btn btn-primary" id="btn-harmony-apply">實時預覽</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  _bindEvents() {
    $('#harmony-close').addEventListener('click', () => hideModal('harmony-checker-modal'));
    
    $('#btn-mode-analogous').addEventListener('click', (e) => {
      this.mode = 'analogous';
      e.target.classList.add('active', 'btn-primary');
      e.target.classList.remove('btn-secondary');
      $('#btn-mode-complementary').classList.remove('active', 'btn-primary');
      $('#btn-mode-complementary').classList.add('btn-secondary');
      this._updateVisuals();
    });

    $('#btn-mode-complementary').addEventListener('click', (e) => {
      this.mode = 'complementary';
      e.target.classList.add('active', 'btn-primary');
      e.target.classList.remove('btn-secondary');
      $('#btn-mode-analogous').classList.remove('active', 'btn-primary');
      $('#btn-mode-analogous').classList.add('btn-secondary');
      this._updateVisuals();
    });

    const hueSlider = $('#harmony-base-hue');
    const tolSlider = $('#harmony-tolerance');

    hueSlider.addEventListener('input', () => {
      this.baseHue = parseInt(hueSlider.value, 10);
      this._updateVisuals();
    });

    tolSlider.addEventListener('input', () => {
      this.tolerance = parseInt(tolSlider.value, 10);
      this._updateVisuals();
    });

    $('#btn-harmony-apply').addEventListener('click', () => {
      this._applyFilter();
    });

    $('#btn-harmony-clear').addEventListener('click', () => {
      bus.emit('filter:clear');
      // Update global tool manager UI state if needed
      window.app?.toolManager?.toggleFilter('none'); // Helper call to clear
    });
  }

  _updateVisuals() {
    $('#harmony-base-val').textContent = `${this.baseHue}°`;
    $('#harmony-tol-val').textContent = `±${this.tolerance}°`;
    $('#harmony-color-preview').style.background = `hsl(${this.baseHue}, 100%, 50%)`;
  }

  _applyFilter() {
    let targetCenter = this.baseHue;
    
    if (this.mode === 'complementary') {
      targetCenter = (this.baseHue + 180) % 360;
    }

    let hueStart = targetCenter - this.tolerance;
    let hueEnd = targetCenter + this.tolerance;

    // Handle wrap around 0 to 360
    hueStart = (hueStart + 360) % 360;
    hueEnd = (hueEnd + 360) % 360;

    bus.emit('filter:apply', {
      type: 'hue',
      params: { hueStart, hueEnd }
    });

    // Make sure tool manager reflects that a filter is active
    // We can emit a custom event to sync with ToolManager if needed, 
    // or ToolManager could listen to apply events as truth source.
  }
}

export const harmonyCheckerModal = new HarmonyCheckerModal();
