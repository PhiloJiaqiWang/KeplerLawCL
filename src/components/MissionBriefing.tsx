"use client";

type MissionBriefingProps = {
  onProceed: () => void;
};

export function MissionBriefing({ onProceed }: MissionBriefingProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-300 bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-slate-900">Mission Briefing</h1>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
          <p>You wake to alarms, flickering lights, and a sharp pain in your head.</p>
          <p>Your spacecraft is damaged.</p>
          <p>You do not remember your name. You do not remember the mission.</p>
          <p>Outside the viewport lies an unfamiliar star system.</p>
          <p>
            Ship diagnostics report severe system failure following a collision. Navigation is offline. Portions of your
            memory appear to be missing.
          </p>
          <p>A message flashes across your terminal:</p>
          <p className="font-semibold text-slate-900">SURVIVOR SIGNAL DETECTED</p>
          <p>Another spacecraft survived the incident.</p>
          <p>
            Communication systems are damaged. Voice and video are unavailable. Only a text channel remains operational.
          </p>
          <p>A calm voice interrupts the alarms.</p>
          <p className="font-semibold text-slate-900">NOVA ONLINE</p>
          <p>Virtual Assistant.</p>
          <p>NOVA explains the problem:</p>
          <p>
            The system’s navigation database is corrupted. To calculate a safe escape trajectory, your ships must
            reconstruct how planets in this star system move around their star.
          </p>
          <p>
            Your ships possess different scientific instruments and observe different parts of the system. Neither of you
            has enough information to solve the problem alone.
          </p>
          <p>
            By investigating the planets’ orbital patterns, speeds, and orbital relationships, you and your partner must
            recover the missing navigation model and restore course calculation.
          </p>
          <p>Scientific measurements consume limited reactor energy.</p>
          <p>Plan carefully. Collaborate effectively. Good luck!</p>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onProceed}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Proceed
          </button>
        </div>
      </section>
    </div>
  );
}
