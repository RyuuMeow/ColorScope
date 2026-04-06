/**
 * CanvasEngine — Renders image, handles zoom/pan (right-click drag), coordinate transforms
 */
import { bus } from '../utils/EventBus.js';
import { $, clamp } from '../utils/DOMUtils.js';

export class CanvasEngine {
  constructor() {
    this.canvas = $('#main-canvas');
    this.overlay = $('#overlay-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.octx = this.overlay.getContext('2d');
    this.container = $('#canvas-container');

    this.image = null;
    this.imageData = null;

    // Transform state
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.minScale = 0.05;
    this.maxScale = 32;

    // Pan via right-click drag
    this._isPanning = false;
    this._panStartX = 0;
    this._panStartY = 0;
    this._panOffsetX = 0;
    this._panOffsetY = 0;

    // Right-click state (pan vs context menu)
    this._rightBtnDown = false;
    this._rightClickStart = { x: 0, y: 0 };
    this._rightDragged = false;

    // Filter
    this._activeFilter = null;
    this._filteredImage = null;

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.container);

    this.layerManager = null; // Set via setLayerManager()

    this._setupEvents();

    bus.on('image:loaded', (data) => this._onImageLoaded(data));
    bus.on('filter:apply', (filter) => this._applyFilter(filter));
    bus.on('filter:clear', () => this._clearFilter());
  }

  setLayerManager(lm) {
    this.layerManager = lm;
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.overlay.width = rect.width * dpr;
    this.overlay.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.overlay.style.width = rect.width + 'px';
    this.overlay.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  _onImageLoaded(data) {
    this.image = data.image;
    this.imageData = data.imageData;
    this._activeFilter = null;
    this._filteredImage = null;
    this._waitAndFit();
  }

  /** Wait until container has dimensions, then fit and render */
  _waitAndFit(retries = 20) {
    const rect = this.container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this._resize();
      this._fitImage();
      this.render();
    } else if (retries > 0) {
      requestAnimationFrame(() => this._waitAndFit(retries - 1));
    }
  }

  /** Fit image to fill the canvas area, centered */
  _fitImage() {
    if (!this.image) return;
    const rect = this.container.getBoundingClientRect();
    const padX = 20, padY = 40;
    const scaleX = (rect.width - padX) / this.image.width;
    const scaleY = (rect.height - padY) / this.image.height;
    this.scale = Math.min(scaleX, scaleY);
    this.offsetX = (rect.width - this.image.width * this.scale) / 2;
    this.offsetY = (rect.height - this.image.height * this.scale) / 2;
    this._updateStatus();
  }

  _setupEvents() {
    const c = this.container;

    // Prevent browser context menu on canvas
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // Wheel zoom
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newScale = clamp(this.scale * zoomFactor, this.minScale, this.maxScale);
      const ratio = newScale / this.scale;

      this.offsetX = mx - (mx - this.offsetX) * ratio;
      this.offsetY = my - (my - this.offsetY) * ratio;
      this.scale = newScale;

      this._updateStatus();
      this.render();
      bus.emit('canvas:transformed');
    }, { passive: false });

    // === Right-click drag → Pan, right-click tap → Context menu ===
    c.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this._rightBtnDown = true;
        this._rightClickStart = { x: e.clientX, y: e.clientY };
        this._rightDragged = false;
        this._startPan(e.clientX, e.clientY);
        e.preventDefault();
      }
    });

    window.addEventListener('mousemove', (e) => {
      // Right-click drag for panning
      if (this._rightBtnDown && this._isPanning) {
        const dx = e.clientX - this._rightClickStart.x;
        const dy = e.clientY - this._rightClickStart.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this._rightDragged = true;
        }
        this._doPan(e.clientX, e.clientY);
      }

      // Emit mouse position for HUD
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (mx >= 0 && my >= 0 && mx <= rect.width && my <= rect.height) {
        const imgCoords = this.screenToImage(mx, my);
        bus.emit('canvas:mousemove', { screenX: e.clientX, screenY: e.clientY, ...imgCoords });
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2 && this._rightBtnDown) {
        this._rightBtnDown = false;
        this._endPan();
        if (!this._rightDragged) {
          // Right-click without drag → context menu
          const rect = c.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const imgCoords = this.screenToImage(sx, sy);
          bus.emit('canvas:contextmenu', {
            screenX: e.clientX, screenY: e.clientY,
            ...imgCoords
          });
        }
      }
    });

    // Touch support — pinch-to-zoom + two-finger pan
    let lastTouchDist = 0;
    let lastTouchCenter = null;

    c.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t = e.touches;
        lastTouchDist = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
        lastTouchCenter = {
          x: (t[0].clientX + t[1].clientX) / 2,
          y: (t[0].clientY + t[1].clientY) / 2
        };
      }
    }, { passive: false });

    c.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t = e.touches;
        const dist = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
        const center = {
          x: (t[0].clientX + t[1].clientX) / 2,
          y: (t[0].clientY + t[1].clientY) / 2
        };
        const rect = c.getBoundingClientRect();
        const mx = center.x - rect.left;
        const my = center.y - rect.top;

        const zoomFactor = dist / lastTouchDist;
        const newScale = clamp(this.scale * zoomFactor, this.minScale, this.maxScale);
        const ratio = newScale / this.scale;

        this.offsetX = mx - (mx - this.offsetX) * ratio;
        this.offsetY = my - (my - this.offsetY) * ratio;

        if (lastTouchCenter) {
          this.offsetX += (center.x - lastTouchCenter.x);
          this.offsetY += (center.y - lastTouchCenter.y);
        }

        this.scale = newScale;
        lastTouchDist = dist;
        lastTouchCenter = center;

        this._updateStatus();
        this.render();
        bus.emit('canvas:transformed');
      }
    }, { passive: false });

    c.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        lastTouchDist = 0;
        lastTouchCenter = null;
      }
    });

    // Space key for temporary pan mode
    this._spaceDown = false;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && !['TEXTAREA','INPUT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        this._spaceDown = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this._spaceDown = false;
    });
  }

  _startPan(x, y) {
    this._isPanning = true;
    this._panStartX = x;
    this._panStartY = y;
    this._panOffsetX = this.offsetX;
    this._panOffsetY = this.offsetY;
  }

  _doPan(x, y) {
    this.offsetX = this._panOffsetX + (x - this._panStartX);
    this.offsetY = this._panOffsetY + (y - this._panStartY);
    this._updateStatus();
    this.render();
    bus.emit('canvas:transformed');
  }

  _endPan() {
    this._isPanning = false;
  }

  screenToImage(sx, sy) {
    return {
      imgX: (sx - this.offsetX) / this.scale,
      imgY: (sy - this.offsetY) / this.scale
    };
  }

  imageToScreen(ix, iy) {
    return {
      sx: ix * this.scale + this.offsetX,
      sy: iy * this.scale + this.offsetY
    };
  }

  // === Filters ===
  _applyFilter(filter) {
    if (!this.imageData) return;
    this._activeFilter = filter.type;

    const src = this.imageData;
    const w = src.width, h = src.height;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w; tempCanvas.height = h;
    const tctx = tempCanvas.getContext('2d');
    const dst = tctx.createImageData(w, h);
    const sd = src.data, dd = dst.data;

    for (let i = 0; i < sd.length; i += 4) {
      const r = sd[i], g = sd[i+1], b = sd[i+2], a = sd[i+3];
      if (filter.type === 'grayscale') {
        const gray = Math.round(0.299*r + 0.587*g + 0.114*b);
        dd[i]=gray; dd[i+1]=gray; dd[i+2]=gray; dd[i+3]=a;
      } else if (filter.type === 'saturation') {
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        const sat = max === 0 ? 0 : (max-min)/max;
        dd[i]=Math.round(255*Math.min(1,sat*2.5));
        dd[i+1]=Math.round(255*Math.max(0,sat<0.4?sat*2.5:sat>0.7?(1-sat)*3.3:1));
        dd[i+2]=Math.round(255*Math.max(0,1-sat*2));
        dd[i+3]=a;
      } else if (filter.type === 'hue') {
        const max2=Math.max(r,g,b), min2=Math.min(r,g,b), d2=max2-min2;
        let hue=0;
        if(d2>0){
          if(max2===r) hue=((g-b)/d2+(g<b?6:0))/6*360;
          else if(max2===g) hue=((b-r)/d2+2)/6*360;
          else hue=((r-g)/d2+4)/6*360;
        }
        const hs=filter.params?.hueStart??0, he=filter.params?.hueEnd??60;
        const inR = hs<=he ? (hue>=hs&&hue<=he) : (hue>=hs||hue<=he);
        if(!inR || d2<10){
          const gr=Math.round(0.299*r+0.587*g+0.114*b);
          dd[i]=gr;dd[i+1]=gr;dd[i+2]=gr;dd[i+3]=a;
        } else {
          dd[i]=r;dd[i+1]=g;dd[i+2]=b;dd[i+3]=a;
        }
      } else {
        dd[i]=r;dd[i+1]=g;dd[i+2]=b;dd[i+3]=a;
      }
    }

    this.filteredImageData = dst;
    tctx.putImageData(dst, 0, 0);
    this._filteredImage = new Image();
    this._filteredImage.onload = () => this.render();
    this._filteredImage.src = tempCanvas.toDataURL();
  }

  _clearFilter() {
    this._activeFilter = null;
    this._filteredImage = null;
    this.filteredImageData = null;
    this.render();
  }

  render() {
    if (!this.ctx) return;
    const rect = this.container.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w === 0 || h === 0) return;

    this.ctx.clearRect(0, 0, w, h);
    this.octx.clearRect(0, 0, w, h);

    if (!this.image) return;

    this.ctx.save();
    this.ctx.imageSmoothingEnabled = this.scale < 4;
    this.ctx.imageSmoothingQuality = 'high';

    const drawImg = (this._activeFilter && this._filteredImage) ? this._filteredImage : this.image;
    this.ctx.drawImage(drawImg, this.offsetX, this.offsetY, this.image.width * this.scale, this.image.height * this.scale);
    this.ctx.restore();

    // Render all visible layer objects
    if (this.layerManager) {
      const objs = this.layerManager.getVisibleObjects();
      for (const obj of objs) {
        obj.render(this.octx, this.scale, this.offsetX, this.offsetY, { width: w, height: h });
      }
    }

    // Emit for tool previews (drawing in progress, selection rects, etc.)
    bus.emit('canvas:render', {
      ctx: this.octx,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      width: w, height: h
    });
  }

  _updateStatus() {
    bus.emit('canvas:status', { zoom: Math.round(this.scale * 100) });
  }

  get isPanning() { return this._isPanning; }
}
