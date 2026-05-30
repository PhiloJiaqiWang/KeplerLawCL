"use client";

import { useMemo, useState } from "react";
import { getMaxMeasurementsForSimulation } from "@/lib/measurementLimits";
import { STAGE_OBJECTIVES_BY_SIMULATION } from "@/lib/workflows";
import type { ParticipantRole, RoomState } from "@/lib/types";

type StagePanelProps = {
  room: RoomState;
  role: ParticipantRole;
  onSubmitPlan: (planText: string, collaborationConfirmed: boolean) => Promise<void>;
  onProceedToDiscussion: () => Promise<void>;
  onSubmitDiscussion: (q1: string, q2: string) => Promise<void>;
};

export function StagePanel({
  room,
  role,
  onSubmitPlan,
  onProceedToDiscussion,
  onSubmitDiscussion,
}: StagePanelProps) {
  const [planText, setPlanText] = useState("");
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [showProceedWarning, setShowProceedWarning] = useState(false);
  const [thirdLawXPower, setThirdLawXPower] = useState<1 | 2 | 3>(3);
  const [thirdLawYPower, setThirdLawYPower] = useState<1 | 2 | 3>(2);
  const [isProceeding, setIsProceeding] = useState(false);
  const [isSubmittingDiscussion, setIsSubmittingDiscussion] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentProgress = room.progressBySimulation[room.currentSimulation];
  const currentStage = currentProgress.currentStage;
  const stageTabs: Array<"Planning" | "Investigation" | "Discussion"> = ["Planning", "Investigation", "Discussion"];
  const maxMeasurements = getMaxMeasurementsForSimulation(room.currentSimulation);
  const measurementRemaining = Math.max(0, maxMeasurements - currentProgress.measurements.length);

  const myPlan = currentProgress.planByRole[role];
  const measurementRows = currentProgress.measurements;
  const focusSumsByPoint = useMemo(() => {
    const map = new Map<string, { focus1?: number; focus2?: number }>();
    for (const record of measurementRows) {
      if (record.target !== "Focus 1" && record.target !== "Focus 2") continue;
      const entry = map.get(record.point) ?? {};
      if (record.target === "Focus 1") entry.focus1 = record.distance;
      if (record.target === "Focus 2") entry.focus2 = record.distance;
      map.set(record.point, entry);
    }

    return Array.from(map.entries()).map(([point, value]) => {
      const hasBoth = value.focus1 !== undefined && value.focus2 !== undefined;
      const sum = hasBoth ? Number((value.focus1! + value.focus2!).toFixed(1)) : null;
      return { point, focus1: value.focus1 ?? null, focus2: value.focus2 ?? null, sum, hasBoth };
    });
  }, [measurementRows]);

  const completedFocusPairs = focusSumsByPoint.filter((row) => row.hasBoth);
  const hasMinimumEllipseEvidence = completedFocusPairs.length >= 2;
  const thirdLawOrbitSummary = useMemo(() => {
    const orbitOrder: Array<"Orbit 1" | "Orbit 2" | "Orbit 3" | "Orbit 4" | "Orbit 5" | "Orbit 6"> = [
      "Orbit 1",
      "Orbit 2",
      "Orbit 3",
      "Orbit 4",
      "Orbit 5",
      "Orbit 6",
    ];
    const latestByOrbit = new Map<
      "Orbit 1" | "Orbit 2" | "Orbit 3" | "Orbit 4" | "Orbit 5" | "Orbit 6",
      { period?: number; axis?: number }
    >();

    for (const orbit of orbitOrder) {
      latestByOrbit.set(orbit, {});
    }

    for (const record of measurementRows) {
      if (!record.orbitLabel || !orbitOrder.includes(record.orbitLabel)) continue;
      if (record.value === undefined) continue;
      const current = latestByOrbit.get(record.orbitLabel) ?? {};
      if (record.tool === "Period Tool") current.period = record.value;
      if (record.tool === "Axis Tool") current.axis = record.value;
      latestByOrbit.set(record.orbitLabel, current);
    }

    return orbitOrder.map((orbit) => {
      const v = latestByOrbit.get(orbit) ?? {};
      const p2 = v.period !== undefined ? Number((v.period * v.period).toFixed(2)) : null;
      const a3 = v.axis !== undefined ? Number((v.axis * v.axis * v.axis).toFixed(2)) : null;
      return { orbit, period: v.period ?? null, axis: v.axis ?? null, p2, a3 };
    });
  }, [measurementRows]);
  const thirdLawPlotPoints = useMemo(() => {
    const valid = thirdLawOrbitSummary
      .filter((row) => row.period !== null && row.axis !== null)
      .map((row) => {
        const axis = row.axis as number;
        const period = row.period as number;
        const xValue = Number(axis ** thirdLawXPower);
        const yValue = Number(period ** thirdLawYPower);
        return { ...row, xValue, yValue };
      });
    if (valid.length === 0) return [];
    const maxX = Math.max(...valid.map((v) => v.xValue));
    const maxY = Math.max(...valid.map((v) => v.yValue));
    const minX = 0;
    const minY = 0;
    const width = 300;
    const height = 160;
    const pad = 24;

    return valid.map((row) => {
      const xValue = row.xValue;
      const yValue = row.yValue;
      const x = pad + ((xValue - minX) / Math.max(1, maxX - minX)) * (width - pad * 2);
      const y = height - pad - ((yValue - minY) / Math.max(1, maxY - minY)) * (height - pad * 2);
      return { ...row, x, y };
    });
  }, [thirdLawOrbitSummary, thirdLawXPower, thirdLawYPower]);
  const myDiscussion = currentProgress.discussionAnswersByRole[role];
  const otherRole: ParticipantRole = role === "participantA" ? "participantB" : "participantA";
  const otherDiscussion = currentProgress.discussionAnswersByRole[otherRole];
  const discussionQuestion1 =
    room.currentSimulation === "Kepler Second Law"
      ? "Based on your measurements, how does speed change when the exoplanet is closer to vs farther from the star?"
      : room.currentSimulation === "Kepler Third Law"
        ? "How does orbital period change from inner to outer orbit based on your measurements?"
      : "Is the orbit more consistent with a circle or ellipse? Why?";
  const discussionQuestion2 =
    room.currentSimulation === "Kepler Second Law"
      ? "For equal time intervals, do the swept areas stay approximately consistent across locations? Which records support your claim?"
      : room.currentSimulation === "Kepler Third Law"
        ? "What relationship did you find from your measurements between orbital period and semi-major axis?"
      : "Which measurements best support your conclusion?";
  const debriefText =
    room.currentSimulation === "Kepler Second Law"
      ? "Kepler's Second Law states that the line joining a planet and its star sweeps out equal areas in equal intervals of time."
      : room.currentSimulation === "Kepler Third Law"
        ? "Kepler's Third Law states that the square of orbital period is proportional to the cube of the semi-major axis."
      : "Kepler's First Law states that a planet orbits its star along an ellipse, with the star at one focus of that ellipse.";
  const moduleCompleteText =
    room.currentSimulation === "Kepler Second Law"
      ? "Module 2 complete for surviving. Your orbital dynamics model has been restored and logged."
      : room.currentSimulation === "Kepler Third Law"
        ? "Module 3 complete for surviving. Your orbital scaling model has been restored and logged."
      : "Module 1 complete for surviving. Your orbital reasoning model has been restored and logged.";
  const moduleCompleteLabel =
    room.currentSimulation === "Kepler Second Law"
      ? "Kepler Second Law module is finished. Debrief mode is active."
      : room.currentSimulation === "Kepler Third Law"
        ? "Kepler Third Law module is finished. Debrief mode is active."
      : "Kepler First Law module is finished. Debrief mode is active.";

  const status = useMemo(
    () => [
      { role: "participantA", submitted: Boolean(currentProgress.planByRole.participantA) },
      { role: "participantB", submitted: Boolean(currentProgress.planByRole.participantB) },
    ],
    [currentProgress.planByRole.participantA, currentProgress.planByRole.participantB],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planText.trim()) {
      setError("Please enter your plan before submitting.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await onSubmitPlan(planText.trim(), true);
      setPlanText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit plan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const proceed = async () => {
    setError("");
    setIsProceeding(true);
    try {
      await onProceedToDiscussion();
      setShowProceedWarning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to proceed to Discussion.");
    } finally {
      setIsProceeding(false);
    }
  };

  const submitDiscussion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q1.trim() || !q2.trim()) {
      setError("Please answer both questions before submitting.");
      return;
    }
    setError("");
    setIsSubmittingDiscussion(true);
    try {
      await onSubmitDiscussion(q1.trim(), q2.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit discussion answers.");
    } finally {
      setIsSubmittingDiscussion(false);
    }
  };

  return (
    <section className="h-full rounded-lg border border-slate-300 bg-slate-100 p-4">
      <h2 className="text-lg font-semibold text-slate-900">Workspace</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {stageTabs.map((stage) => (
          <span
            key={stage}
            className={`rounded-md border px-2 py-1 text-xs ${
              stage === currentStage
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {stage}
          </span>
        ))}
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {STAGE_OBJECTIVES_BY_SIMULATION[room.currentSimulation][currentStage]}
      </p>
      {currentStage === "Submission" ? (
        <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Status</p>
          <p className="mt-1 text-lg font-semibold text-emerald-800">Module Complete</p>
          <p className="mt-1 text-sm text-emerald-700">{moduleCompleteLabel}</p>
        </div>
      ) : null}

      {currentStage === "Planning" ? (
        <div className="mt-3 rounded-md border border-slate-300 bg-white p-3">
          <p className="text-sm font-medium text-slate-800">Participant Status</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {status.map((item) => (
              <li key={item.role}>
                {item.role}: {item.submitted ? "Submitted" : "Pending"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {currentStage === "Planning" ? (
        <>
          {myPlan ? (
            <div className="mt-3 rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Your Submitted Plan</p>
              <p className="mt-2 whitespace-pre-wrap">{myPlan}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-3 rounded-md border border-slate-300 bg-white p-3">
              <label className="text-sm font-medium text-slate-800" htmlFor="plan-input">
                Submit your plan
              </label>
              {room.currentSimulation === "Kepler First Law" ? (
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="mt-1">
                    Coordinate with your partner in chat. Build one shared plan to test whether this orbit is
                    circular or elliptical.
                  </p>
                  <p className="mt-1">
                    Include: 1) which orbit points each of you will inspect, 2) which distances each person will
                    measure, 3) what result would support a circular model vs an elliptical model.
                  </p>
                  <p className="mt-1 font-medium">
                    Reactor constraint: only 6 measurements are available in total. Decide together how to allocate
                    them before Investigation.
                  </p>
                </div>
              ) : null}
              {room.currentSimulation === "Kepler Second Law" ? (
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p>
                    Nova has detected unusual orbital behavior. The planet does not appear to move uniformly
                    throughout its orbit.
                  </p>
                  <p className="mt-2">
                    Work with your partner to determine whether the motion follows a hidden underlying rule.
                  </p>
                  <p className="mt-2 font-medium">Both participants can use:</p>
                  <p className="mt-2">
                    <code>Speed Tool</code> (measures the planet&apos;s speed at selected orbit locations).
                    <br />
                    <code>Swept Area Tool</code> (measures the orbital region swept by the star-planet line during a chosen time
                    interval).
                  </p>
                  <p className="mt-2">Before entering Investigation, align on a joint plan:</p>
                  <ul className="mt-1 list-disc pl-5">
                    <li>which speed and swept area measurements each person will collect</li>
                    <li>what patterns or evidence would suggest that the orbit follows a consistent physical principle</li>
                  </ul>
                  <p className="mt-2 font-medium">
                    Reactor constraint: only 6 total measurements are available. Coordinate carefully to decide how to
                    distribute them across locations, tools, and time intervals.
                  </p>
                </div>
              ) : null}
              {room.currentSimulation === "Kepler Third Law" ? (
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p>NOVA has unlocked multiple orbit tracks around the same star.</p>
                  <p className="mt-2">
                    Plan how to compare orbital period and semi-major axis across inner, middle, and outer orbits.
                  </p>
                  <p className="mt-2">Before Investigation, align on:</p>
                  <ul className="mt-1 list-disc pl-5">
                    <li>which orbit each participant will prioritize</li>
                    <li>which Period and Axis measurements to collect within the energy limit</li>
                    <li>how you will test whether period growth matches axis growth nonlinearly</li>
                  </ul>
                  <p className="mt-2 font-medium">
                    Reactor constraint: 12 total measurements are available in this module. Allocate measurements to maximize
                    cross-orbit comparison.
                  </p>
                </div>
              ) : null}
              <textarea
                id="plan-input"
                value={planText}
                onChange={(e) => setPlanText(e.target.value)}
                rows={5}
                placeholder="Type your plan here..."
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
              />
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <button
                disabled={isSubmitting}
                className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-400"
              >
                {isSubmitting ? "Submitting..." : "Submit Plan"}
              </button>
            </form>
          )}
        </>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-slate-400 bg-white p-4 text-sm text-slate-600">
          {currentStage === "Investigation" || currentStage === "Discussion" ? (
            <>
              <p className="font-medium text-slate-800">Investigation Measurements</p>
              <p className="mt-1 text-xs text-slate-700">
                Remaining measurement energy: {measurementRemaining}/{maxMeasurements}. Coordinate in chat before using the next
                measurement.
              </p>
              {room.currentSimulation === "Kepler Third Law" ? (
                <p className="mt-1 text-xs text-slate-700">
                  Third Law log supports up to 12 measurements in this module; scroll the table if needed.
                </p>
              ) : null}
              {measurementRows.length === 0 ? (
                <p className="mt-2">
                  {room.currentSimulation === "Kepler Second Law"
                    ? "No measurements yet. Select a side point, tool, and time interval in the simulation, then click Measure."
                    : room.currentSimulation === "Kepler Third Law"
                      ? "No measurements yet. Select an orbit and tool in the simulation, then click Measure."
                    : "No measurements yet. Click your side points in the simulation to record fixed distances."}
                </p>
              ) : (
                <>
                  <div
                    className={`mt-2 overflow-y-auto rounded border border-slate-300 ${
                      room.currentSimulation === "Kepler Third Law" ? "max-h-[28rem]" : "max-h-44"
                    }`}
                  >
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Time</th>
                          <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Role</th>
                          <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Point</th>
                          {room.currentSimulation === "Kepler Second Law" ? (
                            <>
                              <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Tool</th>
                              <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Interval</th>
                              <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Value</th>
                            </>
                          ) : room.currentSimulation === "Kepler Third Law" ? (
                            <>
                              <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Orbit</th>
                              <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Tool</th>
                              <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Value</th>
                            </>
                          ) : (
                            <>
                              <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Target</th>
                              <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Distance</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {measurementRows.map((record) => (
                          <tr key={record.id} className="odd:bg-white even:bg-slate-50">
                            <td className="border-b border-slate-200 px-2 py-1">
                              {new Date(record.createdAt).toLocaleTimeString()}
                            </td>
                            <td className="border-b border-slate-200 px-2 py-1">{record.role}</td>
                            <td className="border-b border-slate-200 px-2 py-1">{record.point}</td>
                            {room.currentSimulation === "Kepler Second Law" ? (
                              <>
                                <td className="border-b border-slate-200 px-2 py-1">{record.tool ?? "-"}</td>
                                <td className="border-b border-slate-200 px-2 py-1">
                                  {record.timeIntervalSec ? `${record.timeIntervalSec}s` : "-"}
                                </td>
                                <td className="border-b border-slate-200 px-2 py-1">
                                  {record.value !== undefined && record.valueUnit
                                    ? `${record.value.toFixed(2)} ${record.valueUnit}`
                                    : "-"}
                                </td>
                              </>
                            ) : room.currentSimulation === "Kepler Third Law" ? (
                              <>
                                <td className="border-b border-slate-200 px-2 py-1">{record.orbitLabel ?? "-"}</td>
                                <td className="border-b border-slate-200 px-2 py-1">{record.tool ?? "-"}</td>
                                <td className="border-b border-slate-200 px-2 py-1">
                                  {record.value !== undefined && record.valueUnit
                                    ? `${record.value.toFixed(2)} ${record.valueUnit}`
                                    : "-"}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="border-b border-slate-200 px-2 py-1">{record.target}</td>
                                <td className="border-b border-slate-200 px-2 py-1">{record.distance.toFixed(1)}</td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {room.currentSimulation === "Kepler First Law" ? (
                    <div className="mt-3 rounded border border-slate-300 bg-slate-50 p-2 text-xs">
                    <p className="font-medium text-slate-800">Ellipse Evidence Check (Focus Sum)</p>
                    <p className="mt-1 text-slate-700">
                      Collect `Focus 1` and `Focus 2` distances for at least 2 different points, then compare
                      whether the sums are similar.
                    </p>
                    {focusSumsByPoint.length === 0 ? (
                      <p className="mt-1 text-slate-600">No focus-pair data yet.</p>
                    ) : (
                      <table className="mt-2 w-full border-collapse text-left">
                        <thead>
                          <tr>
                            <th className="border-b border-slate-300 px-1 py-1">Point</th>
                            <th className="border-b border-slate-300 px-1 py-1">Focus 1</th>
                            <th className="border-b border-slate-300 px-1 py-1">Focus 2</th>
                            <th className="border-b border-slate-300 px-1 py-1">Sum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {focusSumsByPoint.map((row) => (
                            <tr key={row.point} className="odd:bg-white even:bg-slate-50">
                              <td className="border-b border-slate-200 px-1 py-1">{row.point}</td>
                              <td className="border-b border-slate-200 px-1 py-1">
                                {row.focus1 !== null ? row.focus1.toFixed(1) : "-"}
                              </td>
                              <td className="border-b border-slate-200 px-1 py-1">
                                {row.focus2 !== null ? row.focus2.toFixed(1) : "-"}
                              </td>
                              <td className="border-b border-slate-200 px-1 py-1">
                                {row.sum !== null ? row.sum.toFixed(1) : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <p className={`mt-2 ${hasMinimumEllipseEvidence ? "text-emerald-700" : "text-amber-700"}`}>
                      {hasMinimumEllipseEvidence
                        ? "Enough focus-pair data collected (2+ points). Discuss whether sums support an ellipse."
                        : "Need complete Focus 1 + Focus 2 measurements for at least 2 points."}
                    </p>
                    </div>
                  ) : null}
                  {room.currentSimulation === "Kepler Third Law" ? (
                    <div className="mt-3 rounded border border-slate-300 bg-slate-50 p-2 text-xs">
                      <p className="font-medium text-slate-800">Pattern Plot View</p>
                      <p className="mt-1 text-slate-700">
                        Choose powers for each axis. Points appear after both `Period` and `Axis` are measured for an orbit.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="text-xs text-slate-700">
                          x-axis:
                          <select
                            value={String(thirdLawXPower)}
                            onChange={(e) => setThirdLawXPower(Number(e.target.value) as 1 | 2 | 3)}
                            className="ml-1 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                          >
                            <option value="1">a</option>
                            <option value="2">a²</option>
                            <option value="3">a³</option>
                          </select>
                        </label>
                        <label className="text-xs text-slate-700">
                          y-axis:
                          <select
                            value={String(thirdLawYPower)}
                            onChange={(e) => setThirdLawYPower(Number(e.target.value) as 1 | 2 | 3)}
                            className="ml-1 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                          >
                            <option value="1">P</option>
                            <option value="2">P²</option>
                            <option value="3">P³</option>
                          </select>
                        </label>
                      </div>
                      <div className="mt-2 overflow-x-auto rounded border border-slate-300 bg-white p-2">
                        <svg viewBox="0 0 300 160" className="h-[160px] w-full min-w-[300px]">
                          <line x1="24" y1="136" x2="280" y2="136" stroke="#94a3b8" strokeWidth="1.5" />
                          <line x1="24" y1="136" x2="24" y2="16" stroke="#94a3b8" strokeWidth="1.5" />
                          <text x="282" y="148" fontSize="10" fill="#475569">{`a${thirdLawXPower === 1 ? "" : thirdLawXPower === 2 ? "²" : "³"}`}</text>
                          <text x="8" y="14" fontSize="10" fill="#475569">{`P${thirdLawYPower === 1 ? "" : thirdLawYPower === 2 ? "²" : "³"}`}</text>
                          {thirdLawPlotPoints.map((point) => (
                            <g key={point.orbit}>
                              <circle cx={point.x} cy={point.y} r="4.5" fill="#2563eb" />
                              <text x={point.x + 6} y={point.y - 6} fontSize="9" fill="#1e293b">
                                {point.orbit.replace(" Orbit", "")}
                              </text>
                            </g>
                          ))}
                        </svg>
                      </div>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr>
                              <th className="border-b border-slate-300 px-1 py-1">Orbit</th>
                              <th className="border-b border-slate-300 px-1 py-1">P</th>
                              <th className="border-b border-slate-300 px-1 py-1">a</th>
                            </tr>
                          </thead>
                          <tbody>
                            {thirdLawOrbitSummary.map((row) => (
                              <tr key={row.orbit} className="odd:bg-white even:bg-slate-50">
                                <td className="border-b border-slate-200 px-1 py-1">{row.orbit}</td>
                                <td className="border-b border-slate-200 px-1 py-1">{row.period !== null ? row.period.toFixed(2) : "-"}</td>
                                <td className="border-b border-slate-200 px-1 py-1">{row.axis !== null ? row.axis.toFixed(2) : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  {currentStage === "Investigation" ? (
                    <div className="mt-3">
                      <button
                        disabled={isProceeding}
                        onClick={() => setShowProceedWarning(true)}
                        className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:bg-slate-400"
                      >
                        {isProceeding ? "Proceeding..." : "Proceed to Discussion"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}

              {currentStage === "Discussion" ? (
                <div className="mt-3 rounded border border-slate-300 bg-slate-50 p-3 text-xs">
                  <p className="font-medium text-slate-800">Discussion Questions</p>
                  {myDiscussion ? (
                    <div className="mt-2 space-y-2 text-slate-700">
                      <p>
                        <strong>Q1:</strong> {myDiscussion.q1}
                      </p>
                      <p>
                        <strong>Q2:</strong> {myDiscussion.q2}
                      </p>
                      {!otherDiscussion ? (
                        <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
                          Waiting for the other participant to submit discussion answers.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <form onSubmit={submitDiscussion} className="mt-2 space-y-2">
                      <label className="block">
                        <span className="text-slate-700">1) {discussionQuestion1}</span>
                        <textarea
                          value={q1}
                          onChange={(e) => setQ1(e.target.value)}
                          rows={2}
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="text-slate-700">2) {discussionQuestion2}</span>
                        <textarea
                          value={q2}
                          onChange={(e) => setQ2(e.target.value)}
                          rows={2}
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                      <button
                        disabled={isSubmittingDiscussion}
                        className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:bg-slate-400"
                      >
                        {isSubmittingDiscussion ? "Submitting..." : "Submit Discussion Answers"}
                      </button>
                    </form>
                  )}
                </div>
              ) : null}
            </>
          ) : currentStage === "Submission" ? (
            <div className="rounded border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">NOVA Debrief</p>
              <p className="mt-2">{debriefText}</p>
              <p className="mt-2">{moduleCompleteText}</p>
            </div>
          ) : (
            <p>Planning is complete. Stage-specific tools for {currentStage} will be added next.</p>
          )}
        </div>
      )}
      {showProceedWarning ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-300 bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-slate-900">Proceed to Discussion?</h3>
            <p className="mt-2 text-sm text-slate-700">
              This will move both participants to Discussion mode and no more measurements can be made. Make sure both
              participants have finished measurements first.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                disabled={isProceeding}
                onClick={() => setShowProceedWarning(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={isProceeding}
                onClick={() => void proceed()}
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:bg-slate-400"
              >
                {isProceeding ? "Proceeding..." : "Proceed"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
