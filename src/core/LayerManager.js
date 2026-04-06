/**
 * LayerManager — Manages layers, each holding CanvasObjects
 * Layers render in order, only active layer is interactive.
 */
import { bus } from '../utils/EventBus.js';
import { getCrossLayer } from '../ui/SettingsModal.js';
import { CanvasObject, resetObjectCounter } from './CanvasObject.js';

let _layerIdCounter = 0;

export class LayerManager {
  constructor() {
    this.layers = [];
    this.activeLayerId = null;
    this.addLayer('預設');
  }

  // ===== Layer CRUD =====

  addLayer(name = '新圖層') {
    const layer = {
      id: ++_layerIdCounter,
      name,
      visible: true,
      objects: []
    };
    this.layers.push(layer);
    this.activeLayerId = layer.id;
    bus.emit('layers:changed');
    return layer;
  }

  removeLayer(layerId) {
    if (this.layers.length <= 1) return; // Must keep at least one
    this.layers = this.layers.filter(l => l.id !== layerId);
    if (this.activeLayerId === layerId) {
      this.activeLayerId = this.layers[this.layers.length - 1].id;
    }
    bus.emit('layers:changed');
  }

  renameLayer(layerId, name) {
    const layer = this.getLayer(layerId);
    if (layer) { layer.name = name; bus.emit('layers:changed'); }
  }

  toggleLayerVisibility(layerId) {
    const layer = this.getLayer(layerId);
    if (layer) { layer.visible = !layer.visible; bus.emit('layers:changed'); }
  }

  setActiveLayer(layerId) {
    this.activeLayerId = layerId;
    bus.emit('layers:changed');
  }

  moveLayer(layerId, direction) {
    const idx = this.layers.findIndex(l => l.id === layerId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= this.layers.length) return;
    [this.layers[idx], this.layers[newIdx]] = [this.layers[newIdx], this.layers[idx]];
    bus.emit('layers:changed');
  }

  // ===== Getters =====

  getLayer(layerId) {
    return this.layers.find(l => l.id === layerId) || null;
  }

  getActiveLayer() {
    return this.getLayer(this.activeLayerId);
  }

  /** Get all objects from visible layers (for rendering), bottom to top */
  getVisibleObjects() {
    const objs = [];
    for (const layer of this.layers) {
      if (layer.visible) objs.push(...layer.objects);
    }
    return objs;
  }

  /** Get objects from active layer (or visible if Cross Layer is enabled) */
  getActiveObjects() {
    if (getCrossLayer()) {
      return this.getVisibleObjects();
    }
    const layer = this.getActiveLayer();
    return layer && layer.visible ? layer.objects : [];
  }

  // ===== Object Management (always on active layer) =====

  addObject(obj) {
    const layer = this.getActiveLayer();
    if (layer) {
      layer.objects.push(obj);
      bus.emit('layers:objects-changed');
    }
    return obj;
  }

  removeObject(objId) {
    const layer = this.getActiveLayer();
    if (layer) {
      layer.objects = layer.objects.filter(o => o.id !== objId);
      bus.emit('layers:objects-changed');
    }
  }

  removeObjectFromAny(objId) {
    for (const layer of this.layers) {
      const idx = layer.objects.findIndex(o => o.id === objId);
      if (idx >= 0) { layer.objects.splice(idx, 1); bus.emit('layers:objects-changed'); return; }
    }
  }

  removeObjects(objIds) {
    const idSet = new Set(objIds);
    const layer = this.getActiveLayer();
    if (layer) {
      layer.objects = layer.objects.filter(o => !idSet.has(o.id));
      bus.emit('layers:objects-changed');
    }
  }

  getObjectAt(imgX, imgY, scale) {
    const objs = this.getActiveObjects();
    for (let i = objs.length - 1; i >= 0; i--) {
      if (objs[i].hitTest(imgX, imgY, scale)) return objs[i];
    }
    return null;
  }

  getObjectsInRect(rx, ry, rw, rh) {
    return this.getActiveObjects().filter(o => o.isInRect(rx, ry, rw, rh));
  }

  getObjectsByType(type) {
    return this.getActiveObjects().filter(o => o.type === type);
  }

  getAllObjectsByType(type) {
    const objs = [];
    for (const layer of this.layers) {
      if (layer.visible) {
        objs.push(...layer.objects.filter(o => o.type === type));
      }
    }
    return objs;
  }

  clearActiveLayer() {
    const layer = this.getActiveLayer();
    if (layer) { layer.objects = []; bus.emit('layers:objects-changed'); }
  }

  clearAll() {
    this.layers = [];
    _layerIdCounter = 0;
    this.addLayer('預設');
    bus.emit('layers:changed');
    bus.emit('layers:objects-changed');
  }

  // ===== Selection helpers =====

  deselectAll() {
    for (const layer of this.layers) {
      for (const obj of layer.objects) obj.selected = false;
    }
  }

  getSelectedObjects() {
    return this.getActiveObjects().filter(o => o.selected);
  }

  deleteSelected() {
    if (getCrossLayer()) {
      for (const layer of this.layers) {
        layer.objects = layer.objects.filter(o => !o.selected);
      }
    } else {
      const layer = this.getActiveLayer();
      if (layer) {
        layer.objects = layer.objects.filter(o => !o.selected);
      }
    }
    bus.emit('layers:objects-changed');
  }

  // ===== Serialization =====

  serialize() {
    return {
      activeLayerId: this.activeLayerId,
      layers: this.layers.map(l => ({
        id: l.id, name: l.name, visible: l.visible,
        objects: l.objects.map(o => o.serialize())
      }))
    };
  }

  deserialize(state) {
    if (!state || !state.layers) return;
    this.layers = state.layers.map(ls => {
      const objects = [];
      let maxObjId = 0;
      for (const objData of ls.objects) {
        const obj = CanvasObject.deserialize(objData);
        if (obj) {
          objects.push(obj);
          if (obj.id > maxObjId) maxObjId = obj.id;
        }
      }
      resetObjectCounter(maxObjId);
      return { id: ls.id, name: ls.name, visible: ls.visible, objects };
    });
    this.activeLayerId = state.activeLayerId;
    if (this.layers.length === 0) this.addLayer('預設');
    bus.emit('layers:changed');
    bus.emit('layers:objects-changed');
  }
}
