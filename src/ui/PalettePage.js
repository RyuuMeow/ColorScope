import { $, createElement } from '../utils/DOMUtils.js';
import { PaletteExtractor } from '../analysis/PaletteExtractor.js';
import { hslToHex, rgbToHsl, rgbToHsv, perceivedBrightness, brightnessLabel } from '../core/ColorMath.js';
import { colorDetailsModal } from './ColorDetailsModal.js';

export class PalettePage {
  constructor(appInstance) {
    this.app = appInstance;
    this._history = this._getHistory();
    this.currentPalette = null;
    this._entrySource = 'random';
    this._currentSource = null;

    this._upgradeLayout();
    this._bindEvents();
    this._renderHistory();
  }

  show(generateFromCanvas = false) {
    this._openedFromHome = !$('#home-page').classList.contains('hidden');
    this._entrySource = generateFromCanvas ? 'canvas' : 'random';

    $('#home-page').classList.add('hidden');
    $('#app').classList.add('hidden');
    $('#palette-page').classList.remove('hidden');

    this._resetTransientState();
    this._generatePalette(this._entrySource === 'canvas');
  }

  hide() {
    $('#palette-page').classList.add('hidden');
    this._resetTransientState();
    this._entrySource = 'random';

    if (!this._openedFromHome && this.app.imageLoader?.imageData) {
      $('#app').classList.remove('hidden');
    } else {
      $('#home-page').classList.remove('hidden');
    }
  }

  _bindEvents() {
    $('#btn-palette-back')?.addEventListener('click', () => this.hide());

    const countSlider = $('#palette-count');
    const countVal = $('#palette-count-val');
    countSlider?.addEventListener('input', () => {
      if (countVal) countVal.textContent = countSlider.value;
    });

    const varianceSlider = $('#palette-variance');
    const varianceVal = $('#palette-variance-val');
    varianceSlider?.addEventListener('input', () => {
      if (!varianceVal) return;
      const value = parseInt(varianceSlider.value, 10);
      if (value < 30) varianceVal.textContent = '低 (Low)';
      else if (value < 70) varianceVal.textContent = '中 (Medium)';
      else varianceVal.textContent = '高 (High)';
    });

    varianceSlider?.addEventListener('input', () => {
      this._syncVarianceLabel(parseInt(varianceSlider.value, 10));
    });

    $('#btn-palette-generate')?.addEventListener('click', () => {
      this._generatePalette(this._entrySource === 'canvas');
    });

    $('#btn-palette-export')?.addEventListener('click', () => {
      this._exportCurrentPalette();
    });

    $('#btn-palette-clear-history')?.addEventListener('click', () => {
      if (!confirm('確定要清除所有色版歷史紀錄嗎？ (Clear all saved palette history?)')) return;
      this._history = [];
      localStorage.removeItem('colorscope-palette-history');
      this._renderHistory();
    });
  }

  _upgradeLayout() {
    try {
      const page = $('#palette-page');
      const content = $('.palette-page-content');
      const sidebar = $('.palette-sidebar');
      const main = $('.palette-main');
      const resultCanvas = $('#palette-result-canvas');
      const homeEntry = $('#home-palette-entry');
      const homeButton = $('#btn-palette-home');

      page?.removeAttribute('style');
      content?.removeAttribute('style');
      sidebar?.removeAttribute('style');
      main?.removeAttribute('style');
      resultCanvas?.removeAttribute('style');
      resultCanvas?.classList.add('palette-result-canvas');

      if (main && !main.querySelector('.palette-main-glow')) {
        main.prepend(createElement('div', { className: 'palette-main-glow' }));
      }

      if (homeEntry && homeButton && !homeEntry.querySelector('.home-palette-card')) {
        homeButton.removeAttribute('style');
        homeButton.textContent = '色版生成器 (Palette Generator)';
        homeButton.prepend(this._makeGridIcon());

        const card = createElement('div', { className: 'home-palette-card' }, [
          createElement('div', { className: 'home-palette-copy' }, [
            createElement('span', { className: 'home-palette-eyebrow', textContent: '色版實驗室 (Palette Lab)' }),
            createElement('h2', { textContent: '快速產生新的色彩方向 (Generate a fresh color direction)' }),
            createElement('p', { textContent: '可從首頁隨機生成，或從畫布延伸目前作品色調 (Random from home or extend canvas colors).' })
          ]),
          homeButton
        ]);

        homeEntry.innerHTML = '';
        homeEntry.appendChild(card);
      }

      homeButton?.classList.add('home-palette-btn');

      const logo = $('.header-logo .logo-text', page || document);
      if (logo) logo.textContent = '色版生成器 (Palette Generator)';
      $('#btn-palette-back')?.setAttribute('title', '返回 (Back)');
      if ($('#btn-palette-export')) $('#btn-palette-export').textContent = '匯出 PNG (Export)';

      this._styleRangeControl('palette-count', 'palette-count-val', '顏色數量 (Count)');
      this._styleRangeControl('palette-variance', 'palette-variance-val', '變化程度 (Variance)');

      const schemeLabel = $('#palette-scheme')?.closest('label');
      if (schemeLabel) {
        schemeLabel.className = 'palette-control';
        schemeLabel.removeAttribute('style');
        const labelText = schemeLabel.querySelector('span');
        if (labelText) {
          labelText.className = 'palette-control-label';
          labelText.removeAttribute('style');
          labelText.textContent = '色系配置 (Scheme)';
        }
      }

      const customCard = $('#palette-use-custom')?.closest('div');
      if (customCard) {
        customCard.className = 'palette-custom-card';
        customCard.removeAttribute('style');

        const toggle = $('#palette-use-custom')?.closest('label');
        if (toggle) {
          toggle.className = 'palette-custom-toggle';
          toggle.removeAttribute('style');
          const labelText = toggle.querySelector('span');
          if (labelText) labelText.textContent = '使用自訂基準色 (Custom Base)';
        }

        const picker = $('#palette-custom-color')?.parentElement;
        if (picker) {
          picker.className = 'palette-custom-picker';
          picker.removeAttribute('style');
        }

        $('#palette-custom-color')?.removeAttribute('style');
      }

      const generateBtn = $('#btn-palette-generate');
      if (generateBtn) {
        generateBtn.classList.add('palette-generate-btn');
        generateBtn.removeAttribute('style');
        generateBtn.textContent = '生成色版 (Generate)';
      }

      const historyList = $('#palette-history-list');
      historyList?.classList.add('palette-history-list');
      historyList?.removeAttribute('style');

      const clearHistoryBtn = $('#btn-palette-clear-history');
      if (clearHistoryBtn) clearHistoryBtn.textContent = '清除 (Clear)';

      const groups = Array.from(document.querySelectorAll('.palette-group'));
      const groupMeta = [
        { eyebrow: '控制項 (Controls)', title: '生成選項 (Generation Options)' },
        { eyebrow: '歷史 (History)', title: '歷史色版 (Saved Palettes)' }
      ];

      groups.forEach((group, index) => {
        const title = group.querySelector('h3');
        if (!title) return;

        let header = title.parentElement;
        if (header === group) {
          header = createElement('div', { className: 'palette-group-header' });
          group.insertBefore(header, title);
          header.appendChild(title);
        } else {
          header.classList.add('palette-group-header');
          header.removeAttribute('style');
        }

        let copyWrap = header.querySelector('.palette-group-copy');
        if (!copyWrap) {
          copyWrap = createElement('div', { className: 'palette-group-copy' });
          header.insertBefore(copyWrap, header.firstChild);
        }

        if (!copyWrap.contains(title)) {
          copyWrap.appendChild(title);
        }

        if (!copyWrap.querySelector('.palette-group-eyebrow')) {
          copyWrap.insertBefore(createElement('span', {
            className: 'palette-group-eyebrow',
            textContent: groupMeta[index]?.eyebrow || 'Section'
          }), copyWrap.firstChild);
        }

        title.textContent = groupMeta[index]?.title || title.textContent;
        title.removeAttribute('style');
      });
    } catch (error) {
      console.warn('Palette layout upgrade skipped:', error);
    }
  }

  _styleRangeControl(inputId, valueId, label) {
    const input = $(`#${inputId}`);
    const value = $(`#${valueId}`);
    const wrapper = input?.closest('label');
    const header = value?.parentElement;
    if (!input || !value || !wrapper || !header) return;

    wrapper.className = 'palette-control';
    wrapper.removeAttribute('style');
    header.className = 'palette-control-header';
    header.removeAttribute('style');
    if (header.firstElementChild) header.firstElementChild.textContent = label;
    value.className = 'palette-control-value';
    value.removeAttribute('style');
    input.classList.add('property-slider');
    input.removeAttribute('style');
  }

  _makeGridIcon() {
    return createElement('svg', {
      width: '20',
      height: '20',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      innerHTML: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>'
    });
  }

  _generatePalette(fromCanvas) {
    const count = parseInt($('#palette-count')?.value || '5', 10);
    const scheme = $('#palette-scheme')?.value || 'auto';
    const useCustom = !!$('#palette-use-custom')?.checked;
    let newPalette = [];
    let source = useCustom ? 'custom' : (fromCanvas ? 'canvas' : 'random');

    if (fromCanvas && scheme === 'auto' && !useCustom) {
      try {
        newPalette = PaletteExtractor.extract(this.app.imageLoader.imageData, count);
      } catch (error) {
        console.error(error);
        alert('無法從畫布擷取色彩，已改為隨機生成。 (Could not extract canvas colors, fallback to random.)');
        source = 'random';
        newPalette = this._generateRuleBasedPalette(this._getRandomHSL(), count, 'auto');
      }
    } else {
      let baseHsl;
      const varianceRaw = parseInt($('#palette-variance')?.value || '50', 10);
      const varianceRatio = varianceRaw / 100;

      if (useCustom) {
        const hex = $('#palette-custom-color')?.value || '#6366f1';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        baseHsl = rgbToHsl(r, g, b);
      } else if (fromCanvas && this.app.imageLoader?.imageData) {
        try {
          const dominant = PaletteExtractor.extract(this.app.imageLoader.imageData, 1);
          baseHsl = { ...dominant[0].hsl };
          baseHsl.h = (baseHsl.h + (Math.random() * 2 - 1) * 60 * varianceRatio + 360) % 360;
          baseHsl.s = Math.max(10, Math.min(100, baseHsl.s + (Math.random() * 2 - 1) * 30 * varianceRatio));
          baseHsl.l = Math.max(15, Math.min(85, baseHsl.l + (Math.random() * 2 - 1) * 25 * varianceRatio));
        } catch {
          source = 'random';
          baseHsl = this._getRandomHSL();
        }
      } else {
        baseHsl = this._getRandomHSL();
      }

      newPalette = this._generateRuleBasedPalette(baseHsl, count, scheme);
    }

    this.currentPalette = newPalette;
    this._currentSource = source;
    this._renderPreview();
    this._addToHistory(newPalette, { source, scheme, count });
  }

  _getRandomHSL() {
    return {
      h: Math.floor(Math.random() * 360),
      s: 50 + Math.floor(Math.random() * 50),
      l: 30 + Math.floor(Math.random() * 40)
    };
  }

  _generateRuleBasedPalette(baseHsl, count, scheme) {
    const palette = [];
    const step = 100 / count;
    const varianceRaw = parseInt($('#palette-variance')?.value || '50', 10);
    const varianceRatio = varianceRaw / 100;

    for (let i = 0; i < count; i++) {
      let h = baseHsl.h;
      let s = baseHsl.s;
      let l = baseHsl.l;

      const rand1 = Math.random() * 2 - 1;
      const rand2 = Math.random() * 2 - 1;

      if (scheme === 'analogous') {
        const offset = 20 + 40 * varianceRatio;
        h = (baseHsl.h + (i - Math.floor(count / 2)) * offset + rand1 * 10 * varianceRatio + 360) % 360;
        l = Math.max(15, Math.min(85, baseHsl.l + (i - Math.floor(count / 2)) * 15 * varianceRatio + rand2 * 10 * varianceRatio));
        s = Math.max(20, Math.min(100, baseHsl.s + rand1 * 15 * varianceRatio));
      } else if (scheme === 'complementary') {
        h = i % 2 === 0 ? baseHsl.h : (baseHsl.h + 180 + rand1 * 20 * varianceRatio) % 360;
        l = Math.max(15, Math.min(85, 20 + i * (60 / Math.max(1, count - 1)) + rand2 * 15 * varianceRatio));
        s = Math.max(20, Math.min(100, baseHsl.s + rand1 * 20 * varianceRatio));
      } else if (scheme === 'triadic') {
        const hueOffsets = [0, 120, 240];
        h = (baseHsl.h + hueOffsets[i % 3] + rand1 * 15 * varianceRatio + 360) % 360;
        l = Math.max(15, Math.min(85, 30 + Math.floor(i / 3) * 15 + rand2 * 10 * varianceRatio));
      } else if (scheme === 'monochromatic') {
        h = (baseHsl.h + rand1 * 5 * varianceRatio + 360) % 360;
        l = Math.max(10, Math.min(90, 15 + i * (75 / Math.max(1, count - 1)) + rand2 * 10 * varianceRatio));
        s = Math.max(20, Math.min(100, 100 - i * (50 * varianceRatio / count) + rand1 * 10 * varianceRatio));
      } else {
        h = (baseHsl.h + i * (360 / count) + rand1 * 30 * varianceRatio + 360) % 360;
        l = Math.max(15, Math.min(85, 40 + (i % 2) * 20 + rand2 * 20 * varianceRatio));
      }

      palette.push({
        hex: hslToHex(h, s, l),
        hsl: { h, s, l },
        percentage: Math.round(step)
      });
    }

    return palette;
  }

  _renderPreview(palette = this.currentPalette) {
    const mainArea = $('.palette-main');
    if (!mainArea) return;

    mainArea.querySelector('.palette-preview-shell')?.remove();

    if (!palette || palette.length === 0) {
      mainArea.insertAdjacentHTML(
        'afterbegin',
        '<div class="palette-preview-shell palette-preview-empty"><div class="empty-state"><p>尚未產生色版 (No palette yet)</p><p class="hint">調整參數後點擊生成 (Adjust controls and generate)</p></div></div>'
      );
      return;
    }

    const shell = createElement('div', { className: 'palette-preview-shell' });
    shell.appendChild(createElement('div', { className: 'palette-preview-header' }, [
      createElement('div', {}, [
        createElement('div', { className: 'palette-preview-eyebrow', textContent: '色版預覽 (Palette Preview)' }),
        createElement('h2', { className: 'palette-preview-title', textContent: this._getPreviewTitle() }),
        createElement('p', { className: 'palette-preview-subtitle', textContent: this._getPreviewSubtitle() })
      ]),
      createElement('div', { className: 'palette-preview-badges' }, [
        createElement('span', { className: 'palette-badge', textContent: this._getSourceLabel() }),
        createElement('span', { className: 'palette-badge palette-badge-soft', textContent: `${palette.length} 色` })
      ])
    ]));

    const display = createElement('div', { className: 'palette-display' });
    palette.forEach(color => {
      const textColor = color.hsl.l > 60 ? '#1a1a2e' : '#ffffff';
      const swatch = createElement('div', {
        className: 'palette-display-color',
        style: {
          flex: color.percentage || 1,
          backgroundColor: color.hex,
          color: textColor
        },
        title: '雙擊檢視色彩詳情',
        onDblclick: (e) => {
          e.stopPropagation();
          this._openColorDetails(color);
        },
        innerHTML: `
          <div class="palette-display-meta">
            <span class="palette-display-percent">${color.percentage ? `${color.percentage}%` : ''}</span>
            <strong>${color.hex.toUpperCase()}</strong>
            <span>H${Math.round(color.hsl.h)} S${Math.round(color.hsl.s)} L${Math.round(color.hsl.l)}</span>
          </div>
        `
      });
      display.appendChild(swatch);
    });
    shell.appendChild(display);

    shell.appendChild(createElement('div', { className: 'palette-insights' }, [
      this._createInsightCard('主色 (Lead)', palette[0]?.hex?.toUpperCase() || '--', '目前權重最高色塊 (Highest weighted swatch)'),
      this._createInsightCard('來源 (Source)', this._getSourceLabel(), this._getPreviewSourceHint()),
      this._createInsightCard('模式 (Scheme)', this._getSchemeLabel(), `${palette.length} 色組合`)
    ]));

    mainArea.insertBefore(shell, mainArea.firstChild);
  }

  _addToHistory(palette, meta = {}) {
    const stripped = palette.map(color => ({
      hex: color.hex,
      percentage: color.percentage,
      hsl: color.hsl
    }));

    this._history.unshift({
      id: Date.now().toString(),
      colors: stripped,
      date: new Date().toLocaleDateString(),
      source: meta.source || 'random',
      scheme: meta.scheme || 'auto',
      count: meta.count || stripped.length
    });

    if (this._history.length > 30) this._history.pop();

    localStorage.setItem('colorscope-palette-history', JSON.stringify(this._history));
    this._renderHistory();
  }

  _renderHistory() {
    const list = $('#palette-history-list');
    if (!list) return;
    list.innerHTML = '';

    if (this._history.length === 0) {
      list.innerHTML = '<div class="palette-history-empty">尚無歷史色版 (No saved palettes yet)</div>';
      return;
    }

    this._history.forEach(entry => {
      const row = createElement('div', {
        className: 'palette-history-row',
        onClick: () => {
          this.currentPalette = entry.colors;
          this._currentSource = entry.source || 'history';
          this._renderPreview();
        }
      });

      const preview = createElement('div', { className: 'palette-history-preview' });
      entry.colors.forEach(color => {
        preview.appendChild(createElement('div', {
          style: {
            flex: color.percentage || 1,
            backgroundColor: color.hex
          },
          title: '雙擊檢視色彩詳情',
          onDblclick: (e) => {
            e.stopPropagation();
            this._openColorDetails(color);
          }
        }));
      });

      row.appendChild(preview);
      row.appendChild(createElement('div', { className: 'palette-history-meta' }, [
        createElement('div', { className: 'palette-history-title', textContent: `${entry.count || entry.colors.length} 色 - ${this._getSchemeLabel(entry.scheme)}` }),
        createElement('div', { className: 'palette-history-subtitle', textContent: `${this._getSourceLabel(entry.source)} - ${entry.date}` })
      ]));
      list.appendChild(row);
    });
  }

  _exportCurrentPalette() {
    if (!this.currentPalette) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 250;
    const ctx = canvas.getContext('2d');

    let currentX = 0;
    this.currentPalette.forEach(color => {
      const width = canvas.width * ((color.percentage || (100 / this.currentPalette.length)) / 100);
      ctx.fillStyle = color.hex;
      ctx.fillRect(currentX, 0, width, canvas.height);

      ctx.fillStyle = color.hsl.l > 60 ? '#1a1a2e' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(color.hex.toUpperCase(), currentX + width / 2, canvas.height - 40);

      if (color.percentage) {
        ctx.font = '16px sans-serif';
        ctx.fillText(`${color.percentage}%`, currentX + width / 2, canvas.height - 15);
      }

      currentX += width;
    });

    const link = document.createElement('a');
    link.download = `colorscope-palette-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  _resetTransientState() {
    this.currentPalette = null;
    this._currentSource = null;

    const countSlider = $('#palette-count');
    if (countSlider) countSlider.value = '5';
    const countVal = $('#palette-count-val');
    if (countVal) countVal.textContent = '5';

    const varianceSlider = $('#palette-variance');
    if (varianceSlider) varianceSlider.value = '50';
    this._syncVarianceLabel(50);

    const schemeSelect = $('#palette-scheme');
    if (schemeSelect) schemeSelect.value = 'auto';

    const useCustomCheckbox = $('#palette-use-custom');
    if (useCustomCheckbox) useCustomCheckbox.checked = false;

    const customColor = $('#palette-custom-color');
    if (customColor) customColor.value = '#6366f1';
  }

  _syncVarianceLabel(value = 50) {
    const varianceVal = $('#palette-variance-val');
    if (!varianceVal) return;

    const num = Number.isFinite(value) ? value : 50;
    if (num < 30) varianceVal.textContent = '低 (Low)';
    else if (num < 70) varianceVal.textContent = '中等 (Medium)';
    else varianceVal.textContent = '高 (High)';
  }

  _getHistory() {
    try {
      return JSON.parse(localStorage.getItem('colorscope-palette-history') || '[]');
    } catch {
      return [];
    }
  }

  _getPreviewTitle() {
    if (this._currentSource === 'canvas') return '由畫布延伸色版 (Palette expanded from canvas)';
    if (this._currentSource === 'custom') return '由自訂基準色生成 (Palette from custom base)';
    if (this._currentSource === 'history') return '歷史色版回放 (Saved palette replay)';
    return '隨機探索新色版 (Random palette exploration)';
  }

  _getPreviewSubtitle() {
    if (this._currentSource === 'canvas') return '以當前畫布色調為起點，依所選模式延伸。 (Start from canvas tones, then expand by scheme.)';
    if (this._currentSource === 'custom') return '目前以固定基準色驅動整組色版。 (Driven by the custom base color.)';
    if (this._currentSource === 'history') return '此預覽來自歷史紀錄，可直接再匯出。 (Loaded from history and ready to export.)';
    return '每次從首頁進入都會重新隨機生成。 (A new random base each time from home.)';
  }

  _getPreviewSourceHint() {
    if (this._currentSource === 'canvas') return '離開頁面後會清除畫布來源快取 (Canvas source cache clears on leave)';
    if (this._currentSource === 'custom') return '目前啟用自訂基準色 (Custom base is active)';
    if (this._currentSource === 'history') return '從歷史紀錄載入 (Loaded from history)';
    return '從首頁進入時使用隨機來源 (Random source from home)';
  }

  _getSourceLabel(source = this._currentSource || this._entrySource) {
    const sourceMap = {
      canvas: '畫布 (Canvas)',
      custom: '自訂 (Custom)',
      history: '歷史 (History)',
      random: '隨機 (Random)'
    };
    return sourceMap[source] || '隨機 (Random)';
  }

  _getSchemeLabel(scheme = $('#palette-scheme')?.value || 'auto') {
    const schemeMap = {
      auto: '自動 (Auto)',
      analogous: '相似色 (Analogous)',
      complementary: '互補色 (Complementary)',
      monochromatic: '單色系 (Monochromatic)',
      triadic: '三角色 (Triadic)'
    };
    return schemeMap[scheme] || '自動 (Auto)';
  }

  _openColorDetails(color) {
    if (!color?.hex) return;
    const rgb = this._hexToRgb(color.hex);
    if (!rgb) return;

    const hsl = color.hsl || rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    const brightness = perceivedBrightness(rgb.r, rgb.g, rgb.b);

    colorDetailsModal.show({
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      hex: color.hex,
      hsl,
      hsv,
      brightness,
      brightLabel: brightnessLabel(brightness),
      imgX: 0,
      imgY: 0
    });
  }

  _hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    const value = hex.trim().replace('#', '');
    const normalized = value.length === 3
      ? value.split('').map((ch) => ch + ch).join('')
      : value;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16)
    };
  }

  _createInsightCard(label, value, hint) {
    return createElement('div', { className: 'palette-insight-card' }, [
      createElement('span', { className: 'palette-insight-label', textContent: label }),
      createElement('strong', { className: 'palette-insight-value', textContent: value }),
      createElement('span', { className: 'palette-insight-hint', textContent: hint })
    ]);
  }
}
