"use client";

import { useEffect, useMemo, useState } from "react";
import type { MeasurementPoint, MeasurementTarget, ParticipantRole, SimulationType, Stage } from "@/lib/types";

type SimulationRunnerProps = {
  simulation: SimulationType;
  onChange: (simulation: SimulationType) => Promise<void>;
  onMeasure: (
    point: MeasurementPoint,
    target: MeasurementTarget | null,
    options?: { tool?: "Speed Tool" | "Swept Area Tool"; timeIntervalSec?: 5 | 10 | 15 },
  ) => Promise<void>;
  role: ParticipantRole;
  currentStage?: Stage;
  measurementRemaining: number;
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
}: SimulationRunnerProps) {
  const [theta, setTheta] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [secondLawTool, setSecondLawTool] = useState<"Speed Tool" | "Swept Area Tool">("Speed Tool");
  const [secondLawTimeInterval, setSecondLawTimeInterval] = useState<5 | 10 | 15>(10);
  const [measureError, setMeasureError] = useState("");

  useEffect(() => {
    if (simulation !== "Kepler First Law" && simulation !== "Kepler Second Law") return;

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
        timeIntervalSec: simulation === "Kepler Second Law" ? secondLawTimeInterval : undefined,
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
            <span className="text-xs font-medium text-slate-700">Energy: {measurementRemaining}/6</span>
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
                Ready: {selectedMeasurement.point} | {secondLawTool} | {secondLawTimeInterval}s
              </span>
            ) : (
              <span className="text-xs text-slate-600">Select 1 side point to run the selected tool.</span>
            )}
            <span className="text-xs font-medium text-slate-700">Energy: {measurementRemaining}/6</span>
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
      ) : (
        <div className="mt-4 flex h-[240px] items-center justify-center rounded-md border border-dashed border-slate-400 bg-white text-sm text-slate-500">
          {simulation} placeholder
        </div>
      )}
    </section>
  );
}
