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
    this._compositeCache = null; // Cached composite ImageData (with active filter)
    this._compositeBaseCache = null; // Cached composite ImageData (without active filter)
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

    const invalidateCompositeCache = () => {
      this._compositeCache = null;
      this._compositeBaseCache = null;
    };

    // Invalidate composite cache whenever display-affecting state changes.
    bus.on('image:loaded', invalidateCompositeCache);
    bus.on('layers:changed', invalidateCompositeCache);
    bus.on('layers:properties-changed', invalidateCompositeCache);
    bus.on('filter:apply', invalidateCompositeCache);
    bus.on('filter:applied', invalidateCompositeCache); // backward compatibility
    bus.on('filter:clear', invalidateCompositeCache);
    bus.on('image:adjust:preview', invalidateCompositeCache);
    bus.on('image:adjust:commit', invalidateCompositeCache);
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
      this._compositeBaseCache = null;
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
  getPixel(x, y, options = {}) {
    const { includeActiveFilter = true } = options;
    if (!this.imageData) return null;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.imageData.width || iy >= this.imageData.height) return null;
    
    let container = this.imageData.data;
    
    // Use cached composite if available, generate once if needed.
    // Guard against stale caches from image-size changes.
    if (this.canvasEngine) {
      const cache = includeActiveFilter ? this._compositeCache : this._compositeBaseCache;
      if (cache && (cache.width !== this.imageData.width || cache.height !== this.imageData.height)) {
        if (includeActiveFilter) this._compositeCache = null;
        else this._compositeBaseCache = null;
      }

      if (includeActiveFilter) {
        if (!this._compositeCache) {
          this._compositeCache = this.canvasEngine.getCompositeImageData();
        }
        if (this._compositeCache) container = this._compositeCache.data;
      } else {
        if (!this._compositeBaseCache) {
          this._compositeBaseCache = this.canvasEngine.getCompositeImageData({ includeActiveFilter: false });
        }
        if (this._compositeBaseCache) container = this._compositeBaseCache.data;
      }
    }
    
    const i = (iy * this.imageData.width + ix) * 4;
    return { r: container[i], g: container[i + 1], b: container[i + 2], a: container[i + 3] };
  }
}
