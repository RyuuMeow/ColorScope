/**
 * HarmonyTool - Interactive Magic Wand for Analogous & Complementary finding.
 * Highlights similar colors (white stroke) and related harmony colors (green stroke).
 */
import { bus } from '../utils/EventBus.js';
import { colorDelta } from '../core/ColorMath.js';

export class HarmonyTool {
  constructor(imageLoader, canvasEngine) {
    this.imageLoader = imageLoader;
    this.canvasEngine = canvasEngine;
    
    // Setup offscreen canvas for rendering strokes
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCtx = this.overlayCanvas.getContext('2d');
    
    // Optimization: Downscaled image data for fast processing
    this.thumbData = null;
    this.thumbScale = 1;
    this.thumbCanvas = document.createElement('canvas');
    this.thumbCtx = this.thumbCanvas.getContext('2d');
    
    this.activeMode = null; // 'analogous_wand' or 'complementary_wand'
    
    this._setup();
  }

  _setup() {
    bus.on('image:loaded', () => this._buildThumbnail());
    bus.on('layers:properties-changed', () => this._buildThumbnail());
    bus.on('layers:changed', () => this._buildThumbnail());
    
    bus.on('tool:changed', ({ tool }) => {
      this.activeMode = (tool === 'analogous_wand' || tool === 'complementary_wand') ? tool : null;
      if (!this.activeMode) {
        this._clearOverlay();
        this.canvasEngine.render();
      }
    });

    bus.on('canvas:mousemove', (pos) => {
      if (!this.activeMode || !this.thumbData) return;
      this._processHover(pos.imgX, pos.imgY);
    });

    bus.on('canvas:render', (params) => {
      if (this.activeMode && this.overlayCanvas.width > 0) {
        // Draw the overlay
        // Compute the true physical width scaled to the zoom factor
        const drawWidth = this.imageLoader.image.width * params.scale;
        const drawHeight = this.imageLoader.image.height * params.scale;
        params.ctx.save();
        params.ctx.imageSmoothingEnabled = false;
        params.ctx.drawImage(this.overlayCanvas, params.offsetX, params.offsetY, drawWidth, drawHeight);
        params.ctx.restore();
      }
    });
  }

  _buildThumbnail() {
    // Generate a thumbnail from the composite imageData for fast wand processing
    const fullData = this.canvasEngine.getCompositeImageData();
    if (!fullData || !this.imageLoader.image) return;

    const img = this.imageLoader.image;
    const MAX_DIM = 400; // Size limit for fast JS processing
    this.thumbScale = Math.max(1, Math.max(img.width, img.height) / MAX_DIM);
    
    this.thumbCanvas.width = Math.max(1, Math.floor(img.width / this.thumbScale));
    this.thumbCanvas.height = Math.max(1, Math.floor(img.height / this.thumbScale));
    
    // We draw the full composite data to a temp canvas, then drawImage to resize natively
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = fullData.width;
    tempCanvas.height = fullData.height;
    tempCanvas.getContext('2d').putImageData(fullData, 0, 0);
    
    this.thumbCtx.drawImage(tempCanvas, 0, 0, this.thumbCanvas.width, this.thumbCanvas.height);
    this.thumbData = this.thumbCtx.getImageData(0, 0, this.thumbCanvas.width, this.thumbCanvas.height);
    
    this.overlayCanvas.width = this.thumbCanvas.width;
    this.overlayCanvas.height = this.thumbCanvas.height;
  }

  _clearOverlay() {
    if (this._animInterval) {
      clearInterval(this._animInterval);
      this._animInterval = null;
    }
    if (this.overlayCanvas.width > 0) {
      this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
  }

  _processHover(x, y) {
    this._lastHoverX = x;
    this._lastHoverY = y;
    
    // Throttle via requestAnimationFrame implicitly (assuming mousemove isn't horribly flooding, it's ok)
    if (this._isProcessing) return;
    this._isProcessing = true;

    requestAnimationFrame(() => {
      // Use latest coords in case of queued frames
      const curX = this._lastHoverX !== undefined ? this._lastHoverX : x;
      const curY = this._lastHoverY !== undefined ? this._lastHoverY : y;
      
      const tx = Math.floor(curX / this.thumbScale);
      const ty = Math.floor(curY / this.thumbScale);
      
      const width = this.thumbData.width;
      const height = this.thumbData.height;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) {
        this._clearOverlay();
        this.canvasEngine.render();
        this._isProcessing = false;
        return;
      }

      const idx = (ty * width + tx) * 4;
      const r = this.thumbData.data[idx];
      const g = this.thumbData.data[idx+1];
      const b = this.thumbData.data[idx+2];
      
      // CalculateHSL for target pixel
      import('../core/ColorMath.js').then(({ rgbToHsl, hslToHex, hueInRange }) => {
        const baseHsl = rgbToHsl(r, g, b);
        
        let targetStart2 = -1, targetEnd2 = -1;
        let targetHue2 = 0;
        const tol = 20; // Hue tolerance

        let targetStart1 = (baseHsl.h - tol + 360) % 360;
        let targetEnd1 = (baseHsl.h + tol) % 360;

        if (this.activeMode === 'analogous_wand') {
          let offset = 30;
          targetHue2 = (baseHsl.h + offset) % 360;
          targetStart2 = (targetHue2 - tol + 360) % 360;
          targetEnd2 = (targetHue2 + tol) % 360;
        } else if (this.activeMode === 'complementary_wand') {
          targetHue2 = (baseHsl.h + 180) % 360;
          targetStart2 = (targetHue2 - tol + 360) % 360;
          targetEnd2 = (targetHue2 + tol) % 360;
        }

        // Fast mask building
        const mask1 = new Uint8Array(width * height);
        const mask2 = new Uint8Array(width * height);
        const d = this.thumbData.data;

        for (let i = 0, len = width * height; i < len; i++) {
          const pr = d[i*4], pg = d[i*4+1], pb = d[i*4+2];
          
          const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
          const delta = max - min;
          let h = 0;
          if (delta > 0) {
            if (max === pr) h = ((pg - pb) / delta + (pg < pb ? 6 : 0)) / 6;
            else if (max === pg) h = ((pb - pr) / delta + 2) / 6;
            else h = ((pr - pg) / delta + 4) / 6;
            h = Math.round(h * 360);
          }

          if (delta > 10) { // skip grays
            if (hueInRange(h, targetStart1, targetEnd1)) mask1[i] = 1;
            else if (hueInRange(h, targetStart2, targetEnd2)) mask2[i] = 1;
          }
        }

        // Render Vector Fills
        if (this.overlayCanvas.width !== this.thumbData.width) {
          this.overlayCanvas.width = this.thumbData.width;
          this.overlayCanvas.height = this.thumbData.height;
        }
        
        this.overlayCtx.clearRect(0, 0, width, height);

        const drawSmoothFill = (mask, colorHex) => {
          this.overlayCtx.beginPath();
          let hasFill = false;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              if (mask[y * width + x]) {
                this.overlayCtx.rect(x, y, 1, 1);
                hasFill = true;
              }
            }
          }
          if (hasFill) {
            // Hex to RGBA manual parse to add opacity
            const r = parseInt(colorHex.slice(1,3), 16);
            const g = parseInt(colorHex.slice(3,5), 16);
            const b = parseInt(colorHex.slice(5,7), 16);
            
            // Outer glow
            this.overlayCtx.shadowBlur = 4;
            this.overlayCtx.shadowColor = `rgba(${r},${g},${b},0.8)`;
            // Solid but translucent inner fill
            this.overlayCtx.fillStyle = `rgba(${r},${g},${b},0.6)`;
            this.overlayCtx.fill();
            this.overlayCtx.shadowBlur = 0; // reset
          }
        };

        const baseHex = hslToHex(baseHsl.h, baseHsl.s, baseHsl.l);
        
        // As requested: "把選取範圍的白色框去掉" -> Only draw target masks for analogy/complementary,
        // If it's pure harmony wand, draw the base match
        if (this.activeMode === 'harmony_wand') {
          drawSmoothFill(mask1, baseHex);
        } else {
          const targetHex = hslToHex(targetHue2, Math.max(50, baseHsl.s), baseHsl.l);
          // Only draw mask2 corresponding to the target matching area
          drawSmoothFill(mask2, targetHex);
        }

        if (this._animInterval) {
           clearInterval(this._animInterval);
           this._animInterval = null;
        }
        
        this.canvasEngine.render();
        this._isProcessing = false;
      });
    });
  }
}
