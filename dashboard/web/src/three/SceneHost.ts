import * as THREE from 'three';
import { clampedDpr, pinFallback } from './capability';

/**
 * One WebGLRenderer, one clock, one animation loop, shared by every 3D
 * component in the product. Scenes register and unregister; the single canvas
 * is moved into whichever mount is currently active. The renderer is created
 * lazily on first need and disposed 30 seconds after the last scene leaves.
 * The loop stops entirely rather than idling when nothing is visible.
 */

export interface SceneEntry {
  id: string;
  mount: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  update?: (elapsed: number, delta: number) => void;
  resize?: (w: number, h: number) => void;
  onDegrade?: (reason: string) => void;
}

const scenes = new Map<string, SceneEntry>();
let activeId: string | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let raf = 0;
let disposeTimer = 0;
const clock = new THREE.Clock();

let frames = 0;
let slowSince = 0;
let capped = false;
let lastFrameAt = 0;
let lastW = 0;
let lastH = 0;

function ensureRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(clampedDpr());
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    return renderer;
  } catch (e) {
    degradeAll(`the renderer could not be created: ${(e as Error).message}`);
    return null;
  }
}

function degradeAll(reason: string) {
  pinFallback(reason);
  for (const s of scenes.values()) s.onDegrade?.(reason);
  scenes.clear();
  activeId = null;
  stop();
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastFrameAt = 0;
}

function loop() {
  raf = 0;
  const entry = activeId ? scenes.get(activeId) : null;
  if (!entry || document.hidden) return; // stop, never idle

  const r = ensureRenderer();
  if (!r) return;

  const now = performance.now();
  const frameTime = lastFrameAt ? now - lastFrameAt : 0;
  lastFrameAt = now;
  frames += 1;

  if (frames > 1 && frames <= 4 && frameTime > 24) {
    degradeAll(`the first frames took ${Math.round(frameTime)} ms`);
    return;
  }
  if (frames > 8 && frameTime > 20) {
    degradeAll(`frame time reached ${Math.round(frameTime)} ms`);
    return;
  }
  if (frameTime > 12) {
    if (!slowSince) slowSince = now;
    else if (now - slowSince > 2000) capped = true;
  } else {
    slowSince = 0;
  }

  // Half-rate when the governor has capped us.
  if (capped && frames % 2 === 0) {
    raf = requestAnimationFrame(loop);
    return;
  }

  const w = entry.mount.clientWidth;
  const h = entry.mount.clientHeight;
  if (w && h) {
    if (w !== lastW || h !== lastH) {
      r.setSize(w, h, false);
      if (entry.camera instanceof THREE.PerspectiveCamera) {
        entry.camera.aspect = w / h;
        entry.camera.updateProjectionMatrix();
      }
      entry.resize?.(w, h);
      lastW = w;
      lastH = h;
    }
    entry.update?.(clock.getElapsedTime(), clock.getDelta());
    r.render(entry.scene, entry.camera);
  }

  raf = requestAnimationFrame(loop);
}

function kick() {
  if (!raf && !document.hidden && activeId) raf = requestAnimationFrame(loop);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : kick()));
}

export function register(entry: SceneEntry) {
  if (disposeTimer) {
    clearTimeout(disposeTimer);
    disposeTimer = 0;
  }
  const r = ensureRenderer();
  if (!r) return false;
  scenes.set(entry.id, entry);
  activeId = entry.id;
  entry.mount.appendChild(r.domElement);
  frames = 0;
  slowSince = 0;
  capped = false;
  lastW = 0;
  lastH = 0;
  kick();
  return true;
}

export function setVisible(id: string, visible: boolean) {
  if (!scenes.has(id)) return;
  if (visible) {
    activeId = id;
    kick();
  } else if (activeId === id) {
    activeId = null;
    stop();
  }
}

export function unregister(id: string) {
  const entry = scenes.get(id);
  if (entry && renderer?.domElement.parentElement === entry.mount) {
    entry.mount.removeChild(renderer.domElement);
  }
  scenes.delete(id);
  if (activeId === id) activeId = null;
  if (!scenes.size) {
    stop();
    disposeTimer = window.setTimeout(() => {
      renderer?.dispose();
      renderer = null;
      disposeTimer = 0;
    }, 30_000);
  }
}

/** Disposes geometry and materials a scene created, so unmount really frees. */
export function disposeScene(scene: THREE.Scene) {
  scene.traverse((obj: any) => {
    obj.geometry?.dispose?.();
    const m = obj.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
    else m?.dispose?.();
  });
  scene.clear();
}

export const sceneStats = () => ({
  scenes: scenes.size,
  active: activeId,
  running: Boolean(raf),
  halfRate: capped,
  rendererAlive: Boolean(renderer),
});
