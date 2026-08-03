"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type MemoryGroup = "core" | "source" | "event" | "artifact";
type MemoryNodeKind = "core" | "cluster" | "memory";
type GraphFilter = "all" | "source" | "event" | "artifact";

type MemoryNode = {
  id: string;
  label: string;
  group: MemoryGroup;
  kind: MemoryNodeKind;
  x: number;
  y: number;
  radius: number;
  description: string;
  count?: number;
  phase: number;
};

type RuntimeNode = MemoryNode & {
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
};

type MemoryEdge = {
  source: string;
  target: string;
  relation: "primary" | "related";
  restLength: number;
};

type GraphData = {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  meta: {
    totalMemories: number;
    visibleMemories: number;
    generatedAt: string;
  };
};

type MemoryDetail = {
  id: string;
  label: string;
  group: MemoryGroup;
  kind: MemoryNodeKind;
  summary: string;
  body: string;
  count?: number;
  sourceUrl?: string;
  metadata: Array<{ label: string; value: string }>;
  insights: string[];
};

type ChatMessage = { role: "user" | "assistant"; text: string };

const emptyGraph: GraphData = {
  nodes: [],
  edges: [],
  meta: { totalMemories: 0, visibleMemories: 0, generatedAt: "" },
};

function seededUnit(index: number, salt: number) {
  const value = Math.sin(index * 9283.31 + salt * 1741.73) * 43758.5453;
  return value - Math.floor(value);
}

const filterOptions: Array<{ id: GraphFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "source", label: "Sources" },
  { id: "event", label: "Events" },
  { id: "artifact", label: "Insights" },
];

function groupLabel(group: MemoryGroup) {
  if (group === "source") return "Source memory";
  if (group === "event") return "Event memory";
  if (group === "artifact") return "Knowledge artifact";
  return "System owner";
}

export function MemoryGraph({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: -8 });
  const baseScaleRef = useRef(1);
  const selectedIdRef = useRef<string | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const [filter, setFilter] = useState<GraphFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomLabel, setZoomLabel] = useState(100);
  const [layoutTick, setLayoutTick] = useState(0);
  const [graphData, setGraphData] = useState<GraphData>(emptyGraph);
  const [graphState, setGraphState] = useState<"loading" | "ready" | "error">("loading");
  const [memoryDetail, setMemoryDetail] = useState<MemoryDetail | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatState, setChatState] = useState<"idle" | "sending">("idle");
  const [chatNotice, setChatNotice] = useState("");

  const selectedNode = selectedId
    ? graphData.nodes.find((node) => node.id === selectedId) ?? null
    : null;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setGraphState("loading");
      try {
        const params = new URLSearchParams({ group: filter });
        if (query.trim()) params.set("query", query.trim());
        const response = await fetch(`/api/graph?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Memory graph unavailable");
        const data = await response.json() as GraphData;
        setGraphData(data);
        setGraphState("ready");
        setSelectedId((current) => current && data.nodes.some((node) => node.id === current) ? current : null);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setGraphState("error");
      }
    }, query.trim() ? 220 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filter, query]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/memories/${encodeURIComponent(selectedId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Memory unavailable");
        return response.json() as Promise<MemoryDetail>;
      })
      .then((detail) => {
        setMemoryDetail(detail);
        setDetailState("ready");
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setDetailState("error");
      });
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedIdRef.current) setSelectedId(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const runtimeNodes: RuntimeNode[] = graphData.nodes.map((node, index) => ({
      ...node,
      x: node.x + (seededUnit(index, 17) - 0.5) * 36,
      y: node.y + (seededUnit(index, 29) - 0.5) * 36,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    }));
    const byId = new Map(runtimeNodes.map((node) => [node.id, node]));
    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let lastTime = 0;
    let settledFrames = 0;
    let pointerState:
      | {
          mode: "node";
          node: RuntimeNode;
          startX: number;
          startY: number;
          lastX: number;
          lastY: number;
          moved: boolean;
        }
      | {
          mode: "pan";
          startX: number;
          startY: number;
          panX: number;
          panY: number;
          moved: boolean;
        }
      | null = null;

    const readColor = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    const visibleNodes = runtimeNodes;
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges = graphData.edges.filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
    );

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const density = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      if (width < 680) {
        baseScaleRef.current = Math.min(width / 900, height / 920) * 1.05;
      } else {
        baseScaleRef.current = Math.min(width / 1120, height / 900) * 1.08;
      }
      canvas.width = Math.max(1, Math.round(width * density));
      canvas.height = Math.max(1, Math.round(height * density));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(density, 0, 0, density, 0, 0);
    };

    const scaleValue = () => Math.max(0.18, baseScaleRef.current * zoomRef.current);

    const project = (node: RuntimeNode) => {
      const scale = scaleValue();
      return {
        x: width / 2 + (node.x + panRef.current.x) * scale,
        y: height / 2 + (node.y + panRef.current.y) * scale,
        scale,
      };
    };

    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const scale = scaleValue();
      return {
        x: (clientX - rect.left - width / 2) / scale - panRef.current.x,
        y: (clientY - rect.top - height / 2) / scale - panRef.current.y,
      };
    };

    const simulate = (time: number, delta: number) => {
      const step = Math.min(1.45, Math.max(0.35, delta / 16.67));
      const repulsion = 86;

      for (let first = 0; first < visibleNodes.length; first += 1) {
        const a = visibleNodes[first];
        for (let second = first + 1; second < visibleNodes.length; second += 1) {
          const b = visibleNodes[second];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < 0.01) {
            dx = seededUnit(first + second, 41) - 0.5;
            dy = seededUnit(first + second, 53) - 0.5;
            distanceSquared = dx * dx + dy * dy;
          }
          const distance = Math.sqrt(distanceSquared);
          const force = Math.min(0.16, repulsion / (distanceSquared + 220));
          const forceX = (dx / distance) * force * step;
          const forceY = (dy / distance) * force * step;
          if (a.fx === null) {
            a.vx -= forceX;
            a.vy -= forceY;
          }
          if (b.fx === null) {
            b.vx += forceX;
            b.vy += forceY;
          }
        }
      }

      for (const edge of visibleEdges) {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) continue;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(0.001, Math.hypot(dx, dy));
        const stiffness = edge.relation === "primary" ? 0.0062 : 0.0016;
        const force = (distance - edge.restLength) * stiffness * step;
        const forceX = (dx / distance) * force;
        const forceY = (dy / distance) * force;
        if (source.fx === null) {
          source.vx += forceX;
          source.vy += forceY;
        }
        if (target.fx === null) {
          target.vx -= forceX;
          target.vy -= forceY;
        }
      }

      const clusterAnchors = new Map(runtimeNodes.filter((node) => node.kind === "cluster").map((node) => [node.id, { x: node.x, y: node.y }]));
      for (const node of visibleNodes) {
        if (node.fx !== null && node.fy !== null) {
          node.x = node.fx;
          node.y = node.fy;
          node.vx = 0;
          node.vy = 0;
          continue;
        }

        if (node.id === "mark") {
          node.vx += -node.x * 0.0045 * step;
          node.vy += -node.y * 0.0045 * step;
        } else if (node.kind === "cluster") {
          const anchor = clusterAnchors.get(node.id);
          if (anchor) {
            node.vx += (anchor.x - node.x) * 0.0012 * step;
            node.vy += (anchor.y - node.y) * 0.0012 * step;
          }
        } else {
          node.vx += -node.x * 0.00022 * step;
          node.vy += -node.y * 0.00022 * step;
        }

        const radiusFromCenter = Math.hypot(node.x, node.y);
        if (radiusFromCenter > 470) {
          const boundaryForce = (radiusFromCenter - 470) * 0.0018 * step;
          node.vx -= (node.x / radiusFromCenter) * boundaryForce;
          node.vy -= (node.y / radiusFromCenter) * boundaryForce;
        }

        const floatStrength = node.kind === "memory" ? 0.0012 : 0.0007;
        node.vx += Math.sin(time * 0.00038 + node.phase) * floatStrength * step;
        node.vy += Math.cos(time * 0.00031 + node.phase * 1.37) * floatStrength * step;
        node.vx *= 0.855;
        node.vy *= 0.855;
        const speed = Math.hypot(node.vx, node.vy);
        if (speed > 1.8) {
          node.vx = (node.vx / speed) * 1.8;
          node.vy = (node.vy / speed) * 1.8;
        }
        node.x += node.vx * step;
        node.y += node.vy * step;
      }
    };

    const draw = (time = 0) => {
      const surface = readColor("--graph-surface");
      const line = readColor("--graph-line");
      const lineRelated = readColor("--graph-line-related");
      const text = readColor("--graph-text");
      const faint = readColor("--graph-text-faint");
      const accent = readColor("--signal");
      const colors: Record<MemoryGroup, string> = {
        core: readColor("--graph-core"),
        source: readColor("--graph-source"),
        event: readColor("--graph-event"),
        artifact: readColor("--graph-artifact"),
      };
      const selected = selectedIdRef.current;
      const hovered = hoverIdRef.current;
      const relatedIds = new Set<string>();
      if (selected) {
        relatedIds.add(selected);
        for (const edge of visibleEdges) {
          if (edge.source === selected) relatedIds.add(edge.target);
          if (edge.target === selected) relatedIds.add(edge.source);
        }
      }

      context.clearRect(0, 0, width, height);
      context.fillStyle = surface;
      context.fillRect(0, 0, width, height);

      const glow = context.createRadialGradient(width * 0.5, height * 0.44, 0, width * 0.5, height * 0.44, Math.max(width, height) * 0.62);
      glow.addColorStop(0, readColor("--graph-bloom"));
      glow.addColorStop(1, "transparent");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (const edge of visibleEdges) {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) continue;
        const a = project(source);
        const b = project(target);
        const worldDistance = Math.hypot(target.x - source.x, target.y - source.y);
        const tension = Math.min(1, Math.max(0, (worldDistance - edge.restLength) / edge.restLength));
        const connected = selected ? edge.source === selected || edge.target === selected : false;
        const dimmed = selected ? !connected : false;
        context.globalAlpha = dimmed ? 0.05 : connected ? 0.78 : edge.relation === "related" ? 0.18 : 0.24 + tension * 0.18;
        context.strokeStyle = connected || tension > 0.6 ? accent : edge.relation === "related" ? lineRelated : line;
        context.lineWidth = connected ? 1.35 : 0.65 + tension * 0.55;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();

        if (connected) {
          const progress = (time * 0.00018 + source.phase * 0.13) % 1;
          context.globalAlpha = 0.9;
          context.fillStyle = accent;
          context.beginPath();
          context.arc(a.x + (b.x - a.x) * progress, a.y + (b.y - a.y) * progress, 1.7, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;

      for (const node of visibleNodes) {
        const point = project(node);
        const isSelected = node.id === selected;
        const isHovered = node.id === hovered;
        const isRelated = selected ? relatedIds.has(node.id) : true;
        const radius = Math.max(2.4, node.radius * Math.min(point.scale, 1.45));
        context.globalAlpha = isRelated ? 1 : 0.18;

        if (isSelected || isHovered) {
          context.shadowColor = colors[node.group];
          context.shadowBlur = isSelected ? 22 : 14;
          context.strokeStyle = isSelected ? accent : colors[node.group];
          context.lineWidth = 1;
          context.beginPath();
          context.arc(point.x, point.y, radius + (isSelected ? 8 : 5), 0, Math.PI * 2);
          context.stroke();
        }

        context.fillStyle = colors[node.group];
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;

        const showLabel = width >= 680 || node.kind !== "memory" || isSelected || isHovered;
        if (showLabel) {
          const maxCharacters = node.kind === "memory" ? (isSelected || isHovered ? 54 : 36) : 32;
          const visualLabel = node.label.length > maxCharacters
            ? `${node.label.slice(0, maxCharacters - 1).trim()}…`
            : node.label;
          context.font = node.kind === "core"
            ? "650 13px Geist, sans-serif"
            : node.kind === "cluster"
              ? "600 11.5px Geist, sans-serif"
              : "500 10.5px Geist, sans-serif";
          context.textAlign = "center";
          context.textBaseline = "top";
          const labelWidth = context.measureText(visualLabel).width;
          const labelY = point.y + radius + (node.id === "mark" ? 11 : 7);
          context.globalAlpha = isRelated ? 0.96 : 0.25;
          context.fillStyle = surface;
          context.fillRect(point.x - labelWidth / 2 - 4, labelY - 2, labelWidth + 8, 16);
          context.fillStyle = node.kind === "memory" ? faint : text;
          context.fillText(visualLabel, point.x, labelY);
        }
      }
      context.globalAlpha = 1;
    };

    const frame = (time: number) => {
      const delta = lastTime ? Math.min(34, time - lastTime) : 16.67;
      lastTime = time;
      if (!reducedMotion.matches || settledFrames < 220) {
        simulate(time, delta);
        settledFrames += 1;
      }
      draw(time);
      animationFrame = requestAnimationFrame(frame);
    };

    const hitTest = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      for (let index = visibleNodes.length - 1; index >= 0; index -= 1) {
        const node = visibleNodes[index];
        const point = project(node);
        const radius = Math.max(10, node.radius * point.scale + 6);
        if (Math.hypot(x - point.x, y - point.y) <= radius) return node;
      }
      return null;
    };

    const onPointerDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      const hit = hitTest(event.clientX, event.clientY);
      if (hit) {
        const world = toWorld(event.clientX, event.clientY);
        hit.fx = world.x;
        hit.fy = world.y;
        pointerState = {
          mode: "node",
          node: hit,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          moved: false,
        };
        canvas.style.cursor = "grabbing";
      } else {
        pointerState = {
          mode: "pan",
          startX: event.clientX,
          startY: event.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
          moved: false,
        };
        canvas.style.cursor = "grabbing";
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerState) {
        const hit = hitTest(event.clientX, event.clientY);
        hoverIdRef.current = hit?.id ?? null;
        canvas.style.cursor = hit ? "pointer" : "grab";
        return;
      }

      const dx = event.clientX - pointerState.startX;
      const dy = event.clientY - pointerState.startY;
      if (Math.hypot(dx, dy) > 3) pointerState.moved = true;
      if (pointerState.mode === "node") {
        const world = toWorld(event.clientX, event.clientY);
        pointerState.node.fx = world.x;
        pointerState.node.fy = world.y;
        pointerState.lastX = event.clientX;
        pointerState.lastY = event.clientY;
      } else {
        const scale = scaleValue();
        panRef.current = {
          x: pointerState.panX + dx / scale,
          y: pointerState.panY + dy / scale,
        };
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!pointerState) return;
      if (pointerState.mode === "node") {
        const { node, moved, lastX, lastY, startX, startY } = pointerState;
        node.fx = null;
        node.fy = null;
        if (moved) {
          node.vx = Math.max(-2.2, Math.min(2.2, (lastX - startX) * 0.025));
          node.vy = Math.max(-2.2, Math.min(2.2, (lastY - startY) * 0.025));
        } else {
          if (node.id !== selectedIdRef.current) {
            setDetailState("loading");
            setMemoryDetail(null);
            setChatMessages([]);
            setChatNotice("");
            setSelectedId(node.id);
          }
        }
      } else if (!pointerState.moved) {
        setSelectedId(null);
      }
      pointerState = null;
      canvas.style.cursor = "grab";
      canvas.releasePointerCapture(event.pointerId);
    };

    const onPointerLeave = () => {
      if (!pointerState) hoverIdRef.current = null;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left - width / 2;
      const pointerY = event.clientY - rect.top - height / 2;
      const oldZoom = zoomRef.current;
      const nextZoom = Math.min(2.7, Math.max(0.42, oldZoom * Math.exp(-event.deltaY * 0.0012)));
      const oldScale = baseScaleRef.current * oldZoom;
      const newScale = baseScaleRef.current * nextZoom;
      const worldX = pointerX / oldScale - panRef.current.x;
      const worldY = pointerY / oldScale - panRef.current.y;
      panRef.current = {
        x: pointerX / newScale - worldX,
        y: pointerY / newScale - worldY,
      };
      zoomRef.current = nextZoom;
      setZoomLabel(Math.round(nextZoom * 100));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const amount = 34 / scaleValue();
      if (event.key === "ArrowLeft") panRef.current.x += amount;
      else if (event.key === "ArrowRight") panRef.current.x -= amount;
      else if (event.key === "ArrowUp") panRef.current.y += amount;
      else if (event.key === "ArrowDown") panRef.current.y -= amount;
      else if (event.key === "+" || event.key === "=") {
        zoomRef.current = Math.min(2.7, zoomRef.current * 1.12);
        setZoomLabel(Math.round(zoomRef.current * 100));
      } else if (event.key === "-") {
        zoomRef.current = Math.max(0.42, zoomRef.current / 1.12);
        setZoomLabel(Math.round(zoomRef.current * 100));
      } else return;
      event.preventDefault();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKeyDown);
    resize();
    animationFrame = requestAnimationFrame(frame);

    return () => {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(animationFrame);
    };
  }, [graphData, layoutTick]);

  const resetGraph = () => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: -8 };
    setZoomLabel(100);
    setSelectedId(null);
    setLayoutTick((value) => value + 1);
  };

  const adjustZoom = (factor: number) => {
    zoomRef.current = Math.min(2.7, Math.max(0.42, zoomRef.current * factor));
    setZoomLabel(Math.round(zoomRef.current * 100));
  };

  const submitChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = chatInput.trim();
    if (!selectedId || !memoryDetail || !question || chatState === "sending") return;
    const priorMessages = chatMessages;
    setChatMessages([...priorMessages, { role: "user", text: question }]);
    setChatInput("");
    setChatNotice("");
    setChatState("sending");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memoryId: selectedId, question, messages: priorMessages }),
      });
      const payload = await response.json() as { answer?: string; error?: string };
      const answer = payload.answer || payload.error || "Hermes could not answer this request right now.";
      if (response.ok) setChatMessages((current) => [...current, { role: "assistant", text: answer }]);
      else setChatNotice(answer);
    } catch {
      setChatNotice("Hermes could not answer this request right now.");
    } finally {
      setChatState("idle");
    }
  };

  return (
    <section className="memory-graph memory-graph--dynamic" role="dialog" aria-modal="true" aria-labelledby="memory-graph-title">
      <header className="memory-graph__header">
        <div className="memory-graph__title">
          <span className="logo-mark logo-mark--graph" aria-hidden="true">
            <span className="logo-mark__lobe logo-mark__lobe--left" />
            <span className="logo-mark__lobe logo-mark__lobe--right" />
            <span className="logo-mark__branch" />
          </span>
          <span>
            <small>MARK&apos;S MEMORY</small>
            <strong id="memory-graph-title">Memory Graph</strong>
          </span>
        </div>

        <div className="memory-graph__summary">
          <span><strong>{graphState === "loading" ? "..." : graphData.meta.totalMemories}</strong> indexed memories</span>
          <span className="graph-live"><i />Live relationships</span>
        </div>

        <button className="graph-close" type="button" onClick={onClose} aria-label="Close memory graph">
          Close
        </button>
      </header>

      <div className="graph-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="graph-canvas"
          tabIndex={0}
          aria-label="Interactive force-directed memory graph. Drag a node to stretch its connections, drag the background to move, scroll to zoom, and select a node for details."
        />

        <div className="graph-toolbar">
          <label className="graph-search">
            <span className="sr-only">Search memory graph</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sources, events, insights"
            />
          </label>
          <div className="graph-filters" aria-label="Filter memory graph">
            {filterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={filter === option.id ? "is-active" : ""}
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="graph-result-count">
            {graphState === "loading" ? "Loading" : graphState === "error" ? "Unavailable" : `${graphData.meta.visibleMemories} shown`}
          </span>
        </div>

        <div className="graph-legend" aria-label="Memory graph legend">
          <span><i className="legend-dot legend-dot--source" />Sources</span>
          <span><i className="legend-dot legend-dot--event" />Events</span>
          <span><i className="legend-dot legend-dot--artifact" />Insights</span>
        </div>

        <div className="graph-view-controls" aria-label="Graph view controls">
          <button type="button" onClick={resetGraph}>Reset</button>
          <div className="graph-zoom-control">
            <button type="button" onClick={() => adjustZoom(0.86)} aria-label="Zoom out">-</button>
            <span className="graph-zoom" aria-label={`Graph zoom ${zoomLabel} percent`}>{zoomLabel}%</span>
            <button type="button" onClick={() => adjustZoom(1.16)} aria-label="Zoom in">+</button>
          </div>
        </div>

        <p className="graph-help">Drag a node to stretch its bonds. Release it and watch the network settle.</p>

        <aside className={`graph-inspector${selectedNode ? " is-open" : ""}`} aria-live="polite" aria-hidden={!selectedNode}>
          {selectedNode ? (
            <>
              <button className="graph-inspector__close" type="button" onClick={() => setSelectedId(null)} aria-label="Close memory details">
                Close
              </button>
              <div>
                <p className="eyebrow">{groupLabel(selectedNode.group)}</p>
                <h2>{selectedNode.label}</h2>
                {memoryDetail?.count ? <p className="graph-inspector__count">{memoryDetail.count} connected memories</p> : null}
              </div>
              {detailState === "loading" ? <p className="graph-inspector__state">Loading memory...</p> : null}
              {detailState === "error" ? <p className="graph-inspector__state">This memory could not be loaded.</p> : null}
              {memoryDetail ? (
                <>
                  <p className="memory-detail__summary">{memoryDetail.summary}</p>
                  {memoryDetail.body && memoryDetail.body !== memoryDetail.summary ? (
                    <div className="memory-detail__body">{memoryDetail.body}</div>
                  ) : null}
                  {memoryDetail.insights.length ? (
                    <div className="memory-insights">
                      <strong>Stored insights</strong>
                      <ul>{memoryDetail.insights.map((insight, index) => <li key={`${memoryDetail.id}-${index}`}>{insight}</li>)}</ul>
                    </div>
                  ) : null}
                  <dl>
                    {memoryDetail.metadata.map((item) => (
                      <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                    ))}
                  </dl>
                  {memoryDetail.sourceUrl ? (
                    <a className="memory-source-link" href={memoryDetail.sourceUrl} target="_blank" rel="noreferrer">
                      Open original source <span aria-hidden="true">&#8599;</span>
                    </a>
                  ) : null}
                  <section className="memory-chat" aria-label="Chat with Hermes about this memory">
                    <header>
                      <span><i />Hermes</span>
                      <small>Selected memory context</small>
                    </header>
                    <div className="memory-chat__messages">
                      {chatMessages.length ? chatMessages.map((message, index) => (
                        <p className={`memory-chat__message memory-chat__message--${message.role}`} key={`${message.role}-${index}`}>
                          <strong>{message.role === "user" ? "You" : "Hermes"}</strong>
                          <span>{message.text}</span>
                        </p>
                      )) : (
                        <p className="memory-chat__empty">Ask Hermes to explain, compare, or reason about this memory.</p>
                      )}
                      {chatState === "sending" ? <p className="memory-chat__thinking">Hermes is thinking...</p> : null}
                      {chatNotice ? <p className="memory-chat__notice">{chatNotice}</p> : null}
                    </div>
                    <form onSubmit={submitChat}>
                      <label className="sr-only" htmlFor="memory-chat-input">Ask Hermes</label>
                      <textarea
                        id="memory-chat-input"
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        placeholder="Ask about this memory"
                        rows={2}
                        maxLength={2000}
                      />
                      <button type="submit" disabled={!chatInput.trim() || chatState === "sending"}>Send</button>
                    </form>
                  </section>
                </>
              ) : null}
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
