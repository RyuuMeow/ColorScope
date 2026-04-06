/**
 * FilterTool — Handles filter activation with hue dialog
 */
import { bus } from '../utils/EventBus.js';
import { $, showModal, hideModal } from '../utils/DOMUtils.js';

export class FilterTool {
  constructor() {
    this._setup();
  }

  _setup() {
    bus.on('filter:hue-dialog', () => {
      showModal('hue-dialog');
    });

    // Hue range inputs
    const hueStart = $('#hue-start');
    const hueEnd = $('#hue-end');
    const hueStartVal = $('#hue-start-val');
    const hueEndVal = $('#hue-end-val');

    if (hueStart) {
      hueStart.addEventListener('input', () => {
        hueStartVal.textContent = hueStart.value + '°';
      });
    }
    if (hueEnd) {
      hueEnd.addEventListener('input', () => {
        hueEndVal.textContent = hueEnd.value + '°';
      });
    }

    // Apply hue filter
    $('#btn-hue-apply')?.addEventListener('click', () => {
      const start = parseInt(hueStart.value);
      const end = parseInt(hueEnd.value);
      bus.emit('filter:apply', {
        type: 'hue',
        params: { hueStart: start, hueEnd: end }
      });
      hideModal('hue-dialog');
    });

    // Reset hue
    $('#btn-hue-reset')?.addEventListener('click', () => {
      hueStart.value = 0;
      hueEnd.value = 60;
      hueStartVal.textContent = '0°';
      hueEndVal.textContent = '60°';
    });

    // Close hue dialog
    $('#hue-dialog-close')?.addEventListener('click', () => {
      hideModal('hue-dialog');
      // Deactivate the hue filter button
      bus.emit('filter:clear');
    });
  }
}
