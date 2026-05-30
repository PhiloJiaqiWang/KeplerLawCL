"use client";

import { useEffect, useMemo, useState } from "react";
import type { MeasurementPoint, MeasurementRecord, MeasurementTarget, ParticipantRole, SimulationType, Stage } from "@/lib/types";

type SimulationRunnerProps = {
  simulation: SimulationType;
  onChange: (simulation: SimulationType) => Promise<void>;
  onMeasure: (
    point: MeasurementPoint,
    target: MeasurementTarget | null,
    options?: {
      tool?: "Speed Tool" | "Swept Area Tool";
      timeIntervalSec?: 5 | 10 | 15;
      thirdLawTool?: "Period Tool" | "Axis Tool";
      thirdLawOrbit?: "Orbit 1" | "Orbit 2" | "Orbit 3" | "Orbit 4" | "Orbit 5" | "Orbit 6";
    },
  ) => Promise<void>;
  role: ParticipantRole;
  currentStage?: Stage;
  measurementRemaining: number;
  maxMeasurements: number;
  measurements: MeasurementRecord[];
};

const simulations: SimulationType[] = ["Kepler First Law", "Kepler Second Law", "Kepler Third Law"];

type OrbitPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  side: "left" | "right" | "neutral";
};

export function SimulationRunner({
  simulation,
  onChange,
  onMeasure,
  role,
  currentStage,
  measurementRemaining,
  maxMeasurements,
  measurements,
}: SimulationRunnerProps) {
  const [theta, setTheta] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [secondLawTool, setSecondLawTool] = useState<"Speed Tool" | "Swept Area Tool">("Speed Tool");
  const [secondLawTimeInterval, setSecondLawTimeInterval] = useState<5 | 10 | 15>(10);
  const [thirdLawTool, setThirdLawTool] = useState<"Period Tool" | "Axis Tool">("Period Tool");
  const [thirdLawOrbit, setThirdLawOrbit] = useState<
    "Orbit 1" | "Orbit 2" | "Orbit 3" | "Orbit 4" | "Orbit 5" | "Orbit 6"
  >("Orbit 1");
  const [measureError, setMeasureError] = useState("");

  useEffect(() => {
    if (simulation !== "Kepler First Law" && simulation !== "Kepler Second Law" && simulation !== "Kepler Third Law") return;

    const timer = setInterval(() => {
      setTheta((prev) => (prev + 0.02) % (Math.PI * 2));
    }, 16);

    return () => clearInterval(timer);
  }, [simulation]);

  const firstLawState = useMemo(() => {
    const cx = 220;
    const cy = 130;
    const a = 130;
    const b = 122;
    const c = Math.sqrt(a * a - b * b);
    const focusLeftX = cx - c;
    const focusRightX = cx + c;
    const x = cx + a * Math.cos(theta);
    const y = cy + b * Math.sin(theta);
    const checkpoints: OrbitPoint[] = [
      { id: "l1", label: "L1", x: cx + a * Math.cos((5 * Math.PI) / 6), y: cy + b * Math.sin((5 * Math.PI) / 6), side: "left" },
      { id: "l2", label: "L2", x: cx - a, y: cy, side: "left" },
      { id: "l3", label: "L3", x: cx + a * Math.cos((7 * Math.PI) / 6), y: cy + b * Math.sin((7 * Math.PI) / 6), side: "left" },
      { id: "r1", label: "R1", x: cx + a * Math.cos(-Math.PI / 6), y: cy + b * Math.sin(-Math.PI / 6), side: "right" },
      { id: "r2", label: "R2", x: cx + a, y: cy, side: "right" },
      { id: "r3", label: "R3", x: cx + a * Math.cos(Math.PI / 6), y: cy + b * Math.sin(Math.PI / 6), side: "right" },
      { id: "center", label: "Center", x: cx, y: cy, side: "neutral" },
      { id: "f1", label: "Focus 1", x: focusLeftX, y: cy, side: "neutral" },
      { id: "f2", label: "Focus 2", x: focusRightX, y: cy, side: "neutral" },
    ];

    return { cx, cy, a, b, focusLeftX, x, y, checkpoints };
  }, [theta]);

  const secondLawState = useMemo(() => {
    const cx = 220;
    const cy = 130;
    const a = 130;
    const b = 122;
    const c = Math.sqrt(a * a - b * b);
    const focusLeftX = cx - c;
    const focusRightX = cx + c;
    const x = cx + a * Math.cos(theta);
    const y = cy + b * Math.sin(theta);
    const checkpoints: OrbitPoint[] = [
      { id: "l1", label: "L1", x: cx + a * Math.cos((5 * Math.PI) / 6), y: cy + b * Math.sin((5 * Math.PI) / 6), side: "left" },
      { id: "l2", label: "L2", x: cx - a, y: cy, side: "left" },
      { id: "l3", label: "L3", x: cx + a * Math.cos((7 * Math.PI) / 6), y: cy + b * Math.sin((7 * Math.PI) / 6), side: "left" },
      { id: "r1", label: "R1", x: cx + a * Math.cos(-Math.PI / 6), y: cy + b * Math.sin(-Math.PI / 6), side: "right" },
      { id: "r2", label: "R2", x: cx + a, y: cy, side: "right" },
      { id: "r3", label: "R3", x: cx + a * Math.cos(Math.PI / 6), y: cy + b * Math.sin(Math.PI / 6), side: "right" },
      { id: "center", label: "Center", x: cx, y: cy, side: "neutral" },
      { id: "f1", label: "Focus 1", x: focusLeftX, y: cy, side: "neutral" },
      { id: "f2", label: "Focus 2", x: focusRightX, y: cy, side: "neutral" },
    ];

    return { cx, cy, a, b, focusLeftX, x, y, checkpoints };
  }, [theta]);

  const secondLawAreaVisuals = useMemo(() => {
    if (simulation !== "Kepler Second Law") return [];
    const angleByPoint: Record<MeasurementPoint, number> = {
      L1: (5 * Math.PI) / 6,
      L2: Math.PI,
      L3: (7 * Math.PI) / 6,
      R1: -Math.PI / 6,
      R2: 0,
      R3: Math.PI / 6,
    };
    const colors = ["#60a5fa66", "#34d39966", "#f59e0b66", "#f472b666", "#a78bfa66", "#22d3ee66"];

    const makeSectorPath = (start: number, end: number) => {
      const samples = 18;
      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= samples; i += 1) {
        const t = start + ((end - start) * i) / samples;
        points.push({
          x: secondLawState.cx + secondLawState.a * Math.cos(t),
          y: secondLawState.cy + secondLawState.b * Math.sin(t),
        });
      }
      const head = points[0];
      if (!head) return "";
      const curve = points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
      return `M ${secondLawState.focusLeftX.toFixed(1)} ${secondLawState.cy.toFixed(1)} ${curve} Z`;
    };

    return measurements
      .filter((m) => m.tool === "Swept Area Tool" && m.timeIntervalSec && m.value !== undefined && m.point in angleByPoint)
      .map((m, idx) => {
        const startAngle = angleByPoint[m.point];
        const startX = secondLawState.cx + secondLawState.a * Math.cos(startAngle);
        const startY = secondLawState.cy + secondLawState.b * Math.sin(startAngle);
        const rf = Math.hypot(startX - secondLawState.focusLeftX, startY - secondLawState.cy);
        const delta = Math.max(0.04, Math.min(2.2, (2 * m.value!) / Math.max(1, rf * rf)));
        const endAngle = startAngle + delta;
        return {
          id: m.id,
          path: makeSectorPath(startAngle, endAngle),
          fill: colors[idx % colors.length] ?? "#60a5fa66",
        };
      });
  }, [measurements, secondLawState, simulation]);

  const canAccessSide = (side: OrbitPoint["side"]) => {
    if (side === "neutral") return true;
    if (role === "participantA") return side === "left";
    return side === "right";
  };

  const onPointClick = (point: OrbitPoint) => {
    if (currentStage !== "Investigation") return;
    if (point.side !== "neutral" && !canAccessSide(point.side)) return;

    setMeasureError("");
    setSelectedIds((prev) => {
      if (prev.includes(point.id)) {
        return prev.filter((id) => id !== point.id);
      }
      if (simulation === "Kepler Second Law") {
        return [point.id];
      }
      if (prev.length >= 2) {
        return [prev[1], point.id];
      }
      return [...prev, point.id];
    });
  };

  const pointsById = useMemo(() => {
    const map = new Map<string, OrbitPoint>();
    const activePoints = simulation === "Kepler Second Law" ? secondLawState.checkpoints : firstLawState.checkpoints;
    activePoints.forEach((point) => map.set(point.id, point));
    return map;
  }, [firstLawState.checkpoints, secondLawState.checkpoints, simulation]);

  const selectedPoints = selectedIds
    .map((id) => pointsById.get(id))
    .filter((point): point is OrbitPoint => Boolean(point));

  const selectedMeasurement = useMemo(() => {
    if (simulation === "Kepler Second Law") {
      if (selectedPoints.length !== 1) return null;
      const point = selectedPoints[0];
      if (!point || point.side === "neutral") return null;
      return { point: point.label as MeasurementPoint, target: null as MeasurementTarget | null };
    }
    if (selectedPoints.length !== 2) return null;
    const [a, b] = selectedPoints;
    const sideA = a.side !== "neutral";
    const sideB = b.side !== "neutral";
    if (!sideA && !sideB) return null;

    const source = (sideA ? a : b).label as MeasurementPoint;
    const target = (sideA ? b : a).label as MeasurementTarget;
    return { point: source, target };
  }, [selectedPoints, simulation]);

  const measureSelected = async () => {
    if (currentStage !== "Investigation") return;
    if (measurementRemaining <= 0) {
      setMeasureError("Reactor measurement energy is depleted. No measurements remaining.");
      return;
    }
    if (simulation === "Kepler Third Law") {
      setMeasureError("");
      const point: MeasurementPoint =
        thirdLawOrbit === "Orbit 1"
          ? "L1"
          : thirdLawOrbit === "Orbit 2"
            ? "L2"
            : thirdLawOrbit === "Orbit 3"
              ? "L3"
              : thirdLawOrbit === "Orbit 4"
                ? "R1"
                : thirdLawOrbit === "Orbit 5"
                  ? "R2"
                  : "R3";
      try {
        await onMeasure(point, null, {
          thirdLawTool,
          thirdLawOrbit,
        });
      } catch (error) {
        setMeasureError(error instanceof Error ? error.message : "Measurement failed.");
      }
      return;
    }
    if (!selectedMeasurement) {
      setMeasureError(
        simulation === "Kepler Second Law"
          ? "Select one side point before measuring."
          : "Select two points including at least one side point before measuring.",
      );
      return;
    }
    setMeasureError("");
    try {
      await onMeasure(selectedMeasurement.point, selectedMeasurement.target, {
        tool: simulation === "Kepler Second Law" ? secondLawTool : undefined,
        timeIntervalSec:
          simulation === "Kepler Second Law" && secondLawTool === "Swept Area Tool" ? secondLawTimeInterval : undefined,
      });
      setSelectedIds([]);
    } catch (error) {
      setMeasureError(error instanceof Error ? error.message : "Measurement failed.");
    }
  };

  return (
    <section className="h-full rounded-lg border border-slate-300 bg-slate-100 p-4">
      <h2 className="text-lg font-semibold text-slate-900">Simulation</h2>
      <p className="mt-2 text-sm text-slate-600">
        Observe the orbit and collect evidence to determine the best orbital model.
      </p>
      {currentStage ? (
        <p className="mt-1 text-xs text-slate-500">Stage mode: {currentStage}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {simulations.map((item) => (
          <button
            key={item}
            onClick={() => {
              setSelectedIds([]);
              void onChange(item);
            }}
            className={`rounded-md border px-2 py-1 text-xs ${
              item === simulation
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      {simulation === "Kepler First Law" ? (
        <div className="mt-4 rounded-md border border-slate-300 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <button
              disabled={currentStage !== "Investigation" || measurementRemaining <= 0}
              onClick={() => void measureSelected()}
              className="rounded border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
            >
              Measure
            </button>
            <button
              disabled={currentStage !== "Investigation" || selectedIds.length === 0}
              onClick={() => setSelectedIds([])}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              Clear Selection
            </button>
            {selectedMeasurement ? (
              <span className="text-xs text-slate-600">
                Ready: {selectedMeasurement.point} ↔ {selectedMeasurement.target}
              </span>
            ) : (
              <span className="text-xs text-slate-600">Select 2 points to create a measurement link.</span>
            )}
            <span className="text-xs font-medium text-slate-700">Energy: {measurementRemaining}/{maxMeasurements}</span>
          </div>
          <svg viewBox="0 0 440 260" className="h-[240px] w-full">
            <rect x="0" y="0" width="440" height="260" fill="#f8fafc" />
            <ellipse
              cx={firstLawState.cx}
              cy={firstLawState.cy}
              rx={firstLawState.a}
              ry={firstLawState.b}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <circle cx={firstLawState.focusLeftX} cy={firstLawState.cy} r="12" fill="#f59e0b" />
            <circle cx={firstLawState.x} cy={firstLawState.y} r="7" fill="#2563eb" />
            <text x={firstLawState.x + 10} y={firstLawState.y - 8} fontSize="12" fill="#1e293b">
              Exoplanet
            </text>
            {selectedPoints.length === 2 ? (
              <line
                x1={selectedPoints[0].x}
                y1={selectedPoints[0].y}
                x2={selectedPoints[1].x}
                y2={selectedPoints[1].y}
                stroke="#0f172a"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            ) : null}
            {firstLawState.checkpoints.map((point) => {
              const accessible = canAccessSide(point.side);
              const clickable = currentStage === "Investigation" && accessible && point.side !== "neutral";
              const selected = selectedIds.includes(point.id);
              return (
                <g
                  key={point.id}
                  onClick={() => void onPointClick(point)}
                  className={clickable ? "cursor-pointer" : undefined}
                >
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={selected ? 6 : point.side === "neutral" ? 4 : 5}
                    fill={selected ? "#dc2626" : accessible ? "#0f172a" : "#94a3b8"}
                  />
                  <text x={point.x + 7} y={point.y - 7} fontSize="10" fill={accessible ? "#1e293b" : "#94a3b8"}>
                    {point.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-2 text-xs text-slate-600">
            Access control: Participant A can inspect left-side points (L1-L3), Participant B can inspect right-side
            points (R1-R3). Center and two foci are visible to both.
          </p>
          {currentStage !== "Investigation" ? (
            <p className="mt-1 text-xs text-amber-700">Measurements unlock when stage reaches Investigation.</p>
          ) : null}
          {currentStage === "Investigation" && measurementRemaining <= 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              Measurement limit reached. Discuss with your partner and continue analysis with existing data.
            </p>
          ) : null}
          {measureError ? <p className="mt-1 text-xs text-red-600">{measureError}</p> : null}
        </div>
      ) : simulation === "Kepler Second Law" ? (
        <div className="mt-4 rounded-md border border-slate-300 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <select
              value={secondLawTool}
              onChange={(e) => setSecondLawTool(e.target.value as "Speed Tool" | "Swept Area Tool")}
              disabled={currentStage !== "Investigation"}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:bg-slate-100"
            >
              <option value="Speed Tool">Speed Tool</option>
              <option value="Swept Area Tool">Swept Area Tool</option>
            </select>
            {secondLawTool === "Swept Area Tool" ? (
              <select
                value={String(secondLawTimeInterval)}
                onChange={(e) => setSecondLawTimeInterval(Number(e.target.value) as 5 | 10 | 15)}
                disabled={currentStage !== "Investigation"}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:bg-slate-100"
              >
                <option value="5">5s</option>
                <option value="10">10s</option>
                <option value="15">15s</option>
              </select>
            ) : null}
            <button
              disabled={currentStage !== "Investigation" || measurementRemaining <= 0}
              onClick={() => void measureSelected()}
              className="rounded border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
            >
              Measure
            </button>
            <button
              disabled={currentStage !== "Investigation" || selectedIds.length === 0}
              onClick={() => setSelectedIds([])}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              Clear Selection
            </button>
            {selectedMeasurement ? (
              <span className="text-xs text-slate-600">
                Ready: {selectedMeasurement.point} | {secondLawTool}
                {secondLawTool === "Swept Area Tool" ? ` | ${secondLawTimeInterval}s` : ""}
              </span>
            ) : (
              <span className="text-xs text-slate-600">Select 1 side point to run the selected tool.</span>
            )}
            <span className="text-xs font-medium text-slate-700">Energy: {measurementRemaining}/{maxMeasurements}</span>
          </div>
          <svg viewBox="0 0 440 260" className="h-[240px] w-full">
            <rect x="0" y="0" width="440" height="260" fill="#f8fafc" />
            <ellipse
              cx={secondLawState.cx}
              cy={secondLawState.cy}
              rx={secondLawState.a}
              ry={secondLawState.b}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <circle cx={secondLawState.focusLeftX} cy={secondLawState.cy} r="12" fill="#f59e0b" />
            {secondLawAreaVisuals.map((area) => (
              <path key={area.id} d={area.path} fill={area.fill} stroke="#64748b" strokeWidth="0.8" />
            ))}
            <circle cx={secondLawState.x} cy={secondLawState.y} r="7" fill="#2563eb" />
            <text x={secondLawState.x + 10} y={secondLawState.y - 8} fontSize="12" fill="#1e293b">
              Exoplanet
            </text>
            {selectedPoints.length === 2 ? (
              <line
                x1={selectedPoints[0].x}
                y1={selectedPoints[0].y}
                x2={selectedPoints[1].x}
                y2={selectedPoints[1].y}
                stroke="#0f172a"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            ) : null}
            {secondLawState.checkpoints.map((point) => {
              const accessible = canAccessSide(point.side);
              const clickable = currentStage === "Investigation" && accessible && point.side !== "neutral";
              const selected = selectedIds.includes(point.id);
              return (
                <g
                  key={point.id}
                  onClick={() => void onPointClick(point)}
                  className={clickable ? "cursor-pointer" : undefined}
                >
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={selected ? 6 : point.side === "neutral" ? 4 : 5}
                    fill={selected ? "#dc2626" : accessible ? "#0f172a" : "#94a3b8"}
                  />
                  <text x={point.x + 7} y={point.y - 7} fontSize="10" fill={accessible ? "#1e293b" : "#94a3b8"}>
                    {point.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-2 text-xs text-slate-600">
            Access control: Participant A can inspect left-side points (L1-L3), Participant B can inspect right-side
            points (R1-R3). Center and two foci are visible to both.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Choose a tool and time interval, then measure one accessible side point.
          </p>
          {currentStage !== "Investigation" ? (
            <p className="mt-1 text-xs text-amber-700">Measurements unlock when stage reaches Investigation.</p>
          ) : null}
          {currentStage === "Investigation" && measurementRemaining <= 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              Measurement limit reached. Discuss with your partner and continue analysis with existing data.
            </p>
          ) : null}
          {measureError ? <p className="mt-1 text-xs text-red-600">{measureError}</p> : null}
        </div>
      ) : simulation === "Kepler Third Law" ? (
        <div className="mt-4 rounded-md border border-slate-300 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <select
              value={thirdLawOrbit}
              onChange={(e) =>
                setThirdLawOrbit(e.target.value as "Orbit 1" | "Orbit 2" | "Orbit 3" | "Orbit 4" | "Orbit 5" | "Orbit 6")
              }
              disabled={currentStage !== "Investigation"}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:bg-slate-100"
            >
              <option value="Orbit 1">Orbit 1</option>
              <option value="Orbit 2">Orbit 2</option>
              <option value="Orbit 3">Orbit 3</option>
              <option value="Orbit 4">Orbit 4</option>
              <option value="Orbit 5">Orbit 5</option>
              <option value="Orbit 6">Orbit 6</option>
            </select>
            <select
              value={thirdLawTool}
              onChange={(e) => setThirdLawTool(e.target.value as "Period Tool" | "Axis Tool")}
              disabled={currentStage !== "Investigation"}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:bg-slate-100"
            >
              <option value="Period Tool">Period Tool</option>
              <option value="Axis Tool">Axis Tool</option>
            </select>
            <button
              disabled={currentStage !== "Investigation" || measurementRemaining <= 0}
              onClick={() => void measureSelected()}
              className="rounded border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
            >
              Measure
            </button>
            <span className="text-xs text-slate-600">
              Ready: {thirdLawOrbit} | {thirdLawTool}
            </span>
            <span className="text-xs font-medium text-slate-700">Energy: {measurementRemaining}/{maxMeasurements}</span>
          </div>
          <svg viewBox="0 0 440 260" className="h-[240px] w-full">
            <rect x="0" y="0" width="440" height="260" fill="#f8fafc" />
            <circle cx="220" cy="130" r="11" fill="#f59e0b" />
            <ellipse cx="220" cy="130" rx="58" ry="52" fill="none" stroke="#60a5fa" strokeWidth="2" strokeDasharray="5 4" />
            <ellipse cx="220" cy="130" rx="74" ry="66" fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="5 4" />
            <ellipse cx="220" cy="130" rx="90" ry="80" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="5 4" />
            <ellipse cx="220" cy="130" rx="106" ry="94" fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="5 4" />
            <ellipse cx="220" cy="130" rx="122" ry="108" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 4" />
            <ellipse cx="220" cy="130" rx="138" ry="122" fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="5 4" />
            <circle cx={220 + 58 * Math.cos(theta * 1.45)} cy={130 + 52 * Math.sin(theta * 1.45)} r="4.6" fill="#2563eb" />
            <circle cx={220 + 74 * Math.cos(theta * 1.26)} cy={130 + 66 * Math.sin(theta * 1.26)} r="4.9" fill="#0284c7" />
            <circle cx={220 + 90 * Math.cos(theta * 1.10)} cy={130 + 80 * Math.sin(theta * 1.10)} r="5.1" fill="#0f766e" />
            <circle cx={220 + 106 * Math.cos(theta * 0.96)} cy={130 + 94 * Math.sin(theta * 0.96)} r="5.3" fill="#ca8a04" />
            <circle cx={220 + 122 * Math.cos(theta * 0.84)} cy={130 + 108 * Math.sin(theta * 0.84)} r="5.6" fill="#b45309" />
            <circle cx={220 + 138 * Math.cos(theta * 0.74)} cy={130 + 122 * Math.sin(theta * 0.74)} r="5.8" fill="#c2410c" />
            <text x="282" y="70" fontSize="9" fill="#1e293b">O1</text>
            <text x="302" y="82" fontSize="9" fill="#1e293b">O2</text>
            <text x="320" y="95" fontSize="9" fill="#1e293b">O3</text>
            <text x="336" y="108" fontSize="9" fill="#1e293b">O4</text>
            <text x="350" y="123" fontSize="9" fill="#1e293b">O5</text>
            <text x="362" y="138" fontSize="9" fill="#1e293b">O6</text>
          </svg>
          <p className="mt-2 text-xs text-slate-600">
            Measure period and semi-major axis across multiple orbits, then compare whether P² scales with a³.
          </p>
          {currentStage !== "Investigation" ? (
            <p className="mt-1 text-xs text-amber-700">Measurements unlock when stage reaches Investigation.</p>
          ) : null}
          {currentStage === "Investigation" && measurementRemaining <= 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              Measurement limit reached. Discuss with your partner and continue analysis with existing data.
            </p>
          ) : null}
          {measureError ? <p className="mt-1 text-xs text-red-600">{measureError}</p> : null}
        </div>
      ) : (
        <div className="mt-4 flex h-[240px] items-center justify-center rounded-md border border-dashed border-slate-400 bg-white text-sm text-slate-500">
          {simulation} placeholder
        </div>
      )}
    </section>
  );
}
