/**
 * ImageLoader — Handles drag-and-drop and file input image loading
 */
import { bus } from '../utils/EventBus.js';
import { $ } from '../utils/DOMUtils.js';

export class ImageLoader {
  constructor() {
    this.image = null;
    this.imageData = null;
    this.canvasEngine = null; // Reference to retrieve composite pixels
    this._compositeCache = null; // Cached composite ImageData
    this.fileName = '';
    this._setup();
  }

  _setup() {
    const dropzone = $('#upload-dropzone');
    const fileInput = $('#file-input');

    // Click to upload
    dropzone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.loadFile(file);
    });

    // Drag events
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        this.loadFile(file);
      }
    });

    // Also allow drop on the whole canvas area when app is open
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith('image/')) {
        this.loadFile(file);
      }
    });

    // Invalidate composite cache when layers/properties change
    bus.on('layers:changed', () => { this._compositeCache = null; });
    bus.on('layers:properties-changed', () => { this._compositeCache = null; });
    bus.on('filter:applied', () => { this._compositeCache = null; });
  }

  loadFile(file) {
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => this.loadFromDataURL(e.target.result);
    reader.readAsDataURL(file);
  }

  loadFromDataURL(dataURL, savedState = null) {
    const img = new Image();
    img.onload = () => {
      this.image = img;
      this._compositeCache = null;
      // Extract ImageData
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      this.imageData = ctx.getImageData(0, 0, img.width, img.height);

      bus.emit('image:loaded', {
        image: this.image,
        imageData: this.imageData,
        fileName: this.fileName,
        dataURL,
        state: savedState
      });
    };
    img.src = dataURL;
  }

  /**
   * Get pixel color at image coordinates (not screen coords)
   * Uses cached composite data for performance
   */
  getPixel(x, y) {
    if (!this.imageData) return null;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.imageData.width || iy >= this.imageData.height) return null;
    
    let container = this.imageData.data;
    
    // Use cached composite if available, generate once if needed
    if (this.canvasEngine) {
      if (!this._compositeCache) {
        this._compositeCache = this.canvasEngine.getCompositeImageData();
      }
      if (this._compositeCache) container = this._compositeCache.data;
    }
    
    const i = (iy * this.imageData.width + ix) * 4;
    return { r: container[i], g: container[i + 1], b: container[i + 2], a: container[i + 3] };
  }
}
