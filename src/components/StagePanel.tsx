"use client";

import { useMemo, useState } from "react";
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
  const [isProceeding, setIsProceeding] = useState(false);
  const [isSubmittingDiscussion, setIsSubmittingDiscussion] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentProgress = room.progressBySimulation[room.currentSimulation];
  const currentStage = currentProgress.currentStage;
  const maxMeasurements = 6;
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
  const myDiscussion = currentProgress.discussionAnswersByRole[role];

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
      <h2 className="text-lg font-semibold text-slate-900">Nova</h2>
      <p className="mt-1 text-sm text-slate-700">
        <strong>Current Stage:</strong> {currentStage}
      </p>
      <p className="mt-1 text-sm text-slate-700">
        <strong>Task:</strong> {room.currentSimulation}
      </p>
      <p className="mt-2 text-sm text-slate-600">
        {STAGE_OBJECTIVES_BY_SIMULATION[room.currentSimulation][currentStage]}
      </p>
      {currentStage === "Submission" ? (
        <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Status</p>
          <p className="mt-1 text-lg font-semibold text-emerald-800">Module Complete</p>
          <p className="mt-1 text-sm text-emerald-700">
            Kepler First Law module is finished. Debrief mode is active.
          </p>
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
                Remaining measurement energy: {measurementRemaining}/6. Coordinate in chat before using the next
                measurement.
              </p>
              {measurementRows.length === 0 ? (
                <p className="mt-2">No measurements yet. Click your side points in the simulation to record fixed distances.</p>
              ) : (
                <>
                  <div className="mt-2 max-h-44 overflow-y-auto rounded border border-slate-300">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Time</th>
                          <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Role</th>
                          <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Point</th>
                          <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Target</th>
                          <th className="border-b border-slate-300 px-2 py-1 font-medium text-slate-700">Distance</th>
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
                            <td className="border-b border-slate-200 px-2 py-1">{record.target}</td>
                            <td className="border-b border-slate-200 px-2 py-1">{record.distance.toFixed(1)}</td>
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
                    </div>
                  ) : (
                    <form onSubmit={submitDiscussion} className="mt-2 space-y-2">
                      <label className="block">
                        <span className="text-slate-700">1) Is the orbit more consistent with a circle or ellipse? Why?</span>
                        <textarea
                          value={q1}
                          onChange={(e) => setQ1(e.target.value)}
                          rows={2}
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="text-slate-700">2) Which measurements best support your conclusion?</span>
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
              <p className="mt-2">
                Kepler&apos;s First Law states that a planet orbits its star along an ellipse, with the star at one
                focus of that ellipse.
              </p>
              <p className="mt-2">
                Module 1 complete for surviving. Your orbital reasoning model has been restored and logged.
              </p>
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
