import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { disposeScene, register, setVisible, unregister } from './SceneHost';

export interface GraphNode {
  id: string;
  kind: 'event' | 'entity';
  label: string;
  hue: string;
  weight: number;
}
export interface GraphEdge {
  a: string;
  b: string;
  weight: number;
  kind: 'shared' | 'explicit' | 'membership';
}

/**
 * Connection Field, the Connections screen only.
 *
 * Depth earns its place here: at this node and edge count a flat force layout
 * occludes, and slow parallax separates clusters that are genuinely separate.
 * Everything visible is also present in the paired table, so nothing depends
 * on WebGL. Budget: 400 nodes, 1,200 edges, no textures, no post-processing.
 */
export default function ConnectionField({
  nodes,
  edges,
  focusId,
  onSelect,
  onUnavailable,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusId?: string | null;
  onSelect?: (id: string) => void;
  /** Called when depth cannot run, so the caller restores the flat map. */
  onUnavailable?: (reason: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const focusRef = useRef(focusId);
  focusRef.current = focusId;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const cappedNodes = nodes.slice(0, 400);
    const allowed = new Set(cappedNodes.map((n) => n.id));
    const cappedEdges = edges.filter((e) => allowed.has(e.a) && allowed.has(e.b)).slice(0, 1200);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 400);
    camera.position.set(0, 0, 92);

    /* ---- deterministic layout ------------------------------------ */
    const index = new Map(cappedNodes.map((n, i) => [n.id, i]));
    const pos = new Float32Array(cappedNodes.length * 3);
    let seed = 7919;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    cappedNodes.forEach((n, i) => {
      // Fibonacci shell keeps clusters readable before relaxation.
      const t = (i + 0.5) / cappedNodes.length;
      const phi = Math.acos(1 - 2 * t);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = n.kind === 'event' ? 30 + rand() * 12 : 52 + rand() * 16;
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.72;
      pos[i * 3 + 2] = Math.cos(phi) * r * 0.62;
    });

    // Relaxation: attraction along edges, plus a repulsion floor so clusters
    // stay separable instead of collapsing into one ball.
    const MIN_SEP = 4.2;
    for (let pass = 0; pass < 24; pass += 1) {
      for (const e of cappedEdges) {
        const ia = index.get(e.a);
        const ib = index.get(e.b);
        if (ia == null || ib == null) continue;
        const k = 0.004 * Math.min(e.weight, 5);
        for (let axis = 0; axis < 3; axis += 1) {
          const d = pos[ib * 3 + axis] - pos[ia * 3 + axis];
          pos[ia * 3 + axis] += d * k;
          pos[ib * 3 + axis] -= d * k;
        }
      }
      // Sampled repulsion keeps the cost linear rather than quadratic.
      for (let i = 0; i < cappedNodes.length; i += 1) {
        const j = (i * 7 + pass * 13 + 1) % cappedNodes.length;
        if (i === j) continue;
        const dx = pos[j * 3] - pos[i * 3];
        const dy = pos[j * 3 + 1] - pos[i * 3 + 1];
        const dz = pos[j * 3 + 2] - pos[i * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > MIN_SEP * MIN_SEP || d2 < 1e-4) continue;
        const d = Math.sqrt(d2);
        const push = ((MIN_SEP - d) / d) * 0.5;
        pos[i * 3] -= dx * push;
        pos[i * 3 + 1] -= dy * push;
        pos[i * 3 + 2] -= dz * push;
        pos[j * 3] += dx * push;
        pos[j * 3 + 1] += dy * push;
        pos[j * 3 + 2] += dz * push;
      }
    }

    // Recentre and rescale so the cloud always fills the frame, whatever the
    // relaxation did. Without this a dense graph renders as a distant speck.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < cappedNodes.length; i += 1) {
      cx += pos[i * 3];
      cy += pos[i * 3 + 1];
      cz += pos[i * 3 + 2];
    }
    cx /= cappedNodes.length;
    cy /= cappedNodes.length;
    cz /= cappedNodes.length;
    let maxR = 0;
    for (let i = 0; i < cappedNodes.length; i += 1) {
      pos[i * 3] -= cx;
      pos[i * 3 + 1] -= cy;
      pos[i * 3 + 2] -= cz;
      const r = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      if (r > maxR) maxR = r;
    }
    const TARGET_R = 46;
    const scale = maxR > 0.001 ? TARGET_R / maxR : 1;
    for (let i = 0; i < pos.length; i += 1) pos[i] *= scale;

    /* ---- nodes as one instanced draw ----------------------------- */
    const geo = new THREE.SphereGeometry(1, 12, 9);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92 });
    const mesh = new THREE.InstancedMesh(geo, mat, cappedNodes.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cappedNodes.length * 3), 3);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    cappedNodes.forEach((n, i) => {
      dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const scale = n.kind === 'event' ? 1.05 + Math.min(n.weight, 5) * 0.34 : 0.62 + Math.min(n.weight, 12) * 0.11;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(n.hue);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);

    /* ---- edges as one line segment buffer ------------------------ */
    const linePos = new Float32Array(cappedEdges.length * 6);
    const lineCol = new Float32Array(cappedEdges.length * 6);
    cappedEdges.forEach((e, i) => {
      const ia = index.get(e.a)!;
      const ib = index.get(e.b)!;
      for (let axis = 0; axis < 3; axis += 1) {
        linePos[i * 6 + axis] = pos[ia * 3 + axis];
        linePos[i * 6 + 3 + axis] = pos[ib * 3 + axis];
      }
      const tone = e.kind === 'explicit' ? [0.45, 0.84, 0.91] : e.kind === 'membership' ? [0.28, 0.3, 0.44] : [0.24, 0.42, 0.5];
      for (let v = 0; v < 2; v += 1) for (let c = 0; c < 3; c += 1) lineCol[i * 6 + v * 3 + c] = tone[c];
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3));
    const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16 });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lines);

    const group = new THREE.Group();
    group.add(mesh, lines);
    scene.add(group);

    /* ---- pointer: parallax and picking --------------------------- */
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    const onMove = (ev: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      targetX = ((ev.clientX - r.left) / r.width - 0.5) * 0.5;
      targetY = ((ev.clientY - r.top) / r.height - 0.5) * 0.32;
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
    };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (ev: PointerEvent) => {
      if (!onSelect) return;
      const r = mount.getBoundingClientRect();
      pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (hit && hit.instanceId != null) onSelect(cappedNodes[hit.instanceId].id);
    };
    mount.addEventListener('pointermove', onMove);
    mount.addEventListener('pointerleave', onLeave);
    mount.addEventListener('click', onClick as EventListener);

    const ok = register({
      id: 'connection-field',
      mount,
      scene,
      camera,
      update: (elapsed) => {
        curX += (targetX - curX) * 0.045;
        curY += (targetY - curY) * 0.045;
        group.rotation.y = elapsed * 0.035 + curX;
        group.rotation.x = curY;
        const focus = focusRef.current;
        if (focus) {
          const i = index.get(focus);
          if (i != null) {
            const pulse = 1 + Math.sin(elapsed * 1.6) * 0.18;
            dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
            dummy.scale.setScalar((cappedNodes[i].kind === 'event' ? 1.5 : 1.2) * pulse);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.instanceMatrix.needsUpdate = true;
          }
        }
      },
      onDegrade: (why) => {
        setFailed(true);
        onUnavailable?.(why);
      },
    });
    if (!ok) {
      setFailed(true);
      onUnavailable?.('the renderer could not start');
    }

    const io = new IntersectionObserver(
      ([entry]) => setVisible('connection-field', entry.isIntersecting),
      { threshold: 0.05 },
    );
    io.observe(mount);

    return () => {
      io.disconnect();
      mount.removeEventListener('pointermove', onMove);
      mount.removeEventListener('pointerleave', onLeave);
      mount.removeEventListener('click', onClick as EventListener);
      unregister('connection-field');
      disposeScene(scene);
      geo.dispose();
      mat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
    };
  }, [nodes, edges, onSelect, onUnavailable]);

  if (failed) return null;
  return <div ref={mountRef} className="three-mount three-mount-interactive" />;
}
