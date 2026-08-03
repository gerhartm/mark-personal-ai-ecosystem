/**
 * Gates applied before any renderer is created, in order:
 *   1. reduced motion or the user's Depth setting
 *   2. capability probe
 *   3. first-frame probe, enforced by SceneHost
 *
 * A failure pins the fallback for the session and records the reason.
 */

let probed: boolean | null = null;
let reason = '';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const depthEnabled = () => localStorage.getItem('depth') !== 'off';

export function probeWebGL(): boolean {
  if (probed !== null) return probed;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      probed = false;
      reason = 'WebGL2 is not available in this browser';
      return probed;
    }
    const mem = (navigator as any).deviceMemory;
    if (typeof mem === 'number' && mem < 4) {
      probed = false;
      reason = `device reports ${mem} GB of memory, below the 4 GB floor`;
      return probed;
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|software|llvmpipe/i.test(renderer)) {
      probed = false;
      reason = 'a software renderer was detected';
      return probed;
    }
    probed = true;
    return probed;
  } catch (e) {
    probed = false;
    reason = (e as Error).message;
    return probed;
  }
}

export function pinFallback(why: string) {
  probed = false;
  reason = why;
}

export const fallbackReason = () => reason;

export const canRenderDepth = () => !prefersReducedMotion() && depthEnabled() && probeWebGL();

/** Device pixel ratio is clamped so a retina panel cannot quadruple the cost. */
export const clampedDpr = () => Math.min(window.devicePixelRatio || 1, 1.75);
