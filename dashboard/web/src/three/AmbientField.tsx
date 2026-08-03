import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { disposeScene, register, setVisible, unregister } from './SceneHost';

/**
 * Ambient intelligence field, Brief header only.
 *
 * Data bound so the ambience states something true: point count follows corpus
 * size, luminance follows the share of events with no notes. Budget: one
 * instanced draw call, no textures, no post-processing, amplitude under two
 * pixels of apparent drift, period well over twelve seconds.
 */
export default function AmbientField({
  density,
  intensity,
}: {
  density: number;
  intensity: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const count = Math.min(6000, Math.max(900, density * 84));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 3, 0.1, 90);
    camera.position.set(0, 0, 22);

    const positions = new Float32Array(count * 3);
    const shades = new Float32Array(count);
    // Deterministic placement: the same corpus always renders the same field.
    let seed = 1337 + density;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i += 1) {
      const r = 6 + rand() * 15;
      const theta = rand() * Math.PI * 2;
      const y = (rand() - 0.5) * 11;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * r * 0.55 - 6;
      shades[i] = rand();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('shade', new THREE.BufferAttribute(shades, 1));

    const uniforms = {
      uTime: { value: 0 },
      uIntensity: { value: Math.min(1, Math.max(0.15, intensity)) },
      uAccent: { value: new THREE.Color('#74d5e8') },
      uSecond: { value: new THREE.Color('#9085e9') },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float shade;
        uniform float uTime;
        varying float vShade;
        varying float vDepth;
        void main() {
          vShade = shade;
          vec3 p = position;
          // one slow drift, period well above twelve seconds
          p.y += sin(uTime * 0.06 + position.x * 0.14) * 0.5;
          p.x += cos(uTime * 0.045 + position.z * 0.1) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = clamp((mv.z + 34.0) / 34.0, 0.0, 1.0);
          gl_PointSize = (1.4 + shade * 3.0) * (18.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform float uIntensity;
        uniform vec3 uAccent;
        uniform vec3 uSecond;
        varying float vShade;
        varying float vDepth;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float dist = dot(d, d);
          if (dist > 0.25) discard;
          float falloff = smoothstep(0.25, 0.0, dist);
          vec3 tint = mix(uAccent, uSecond, smoothstep(0.35, 1.0, vShade));
          float alpha = falloff * vDepth * (0.30 + uIntensity * 0.42) * (0.30 + vShade * 0.70);
          gl_FragColor = vec4(tint, alpha);
        }
      `,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const ok = register({
      id: 'ambient-field',
      mount,
      scene,
      camera,
      update: (elapsed) => {
        uniforms.uTime.value = elapsed;
        points.rotation.y = elapsed * 0.012;
      },
      onDegrade: () => setFailed(true),
    });
    if (!ok) setFailed(true);

    const io = new IntersectionObserver(
      ([entry]) => setVisible('ambient-field', entry.isIntersecting),
      { threshold: 0.05 },
    );
    io.observe(mount);

    return () => {
      io.disconnect();
      unregister('ambient-field');
      disposeScene(scene);
      material.dispose();
      geometry.dispose();
    };
  }, [density, intensity]);

  if (failed) return null;
  return <div ref={mountRef} className="three-mount" />;
}
