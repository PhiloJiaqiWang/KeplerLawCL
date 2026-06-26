"use client";

import type { ParticipantRole } from "@/lib/types";

type MissionBriefingProps = {
  role: ParticipantRole;
  onProceed: () => void;
};

const shipByRole: Record<ParticipantRole, { current: string; partner: string }> = {
  participantA: { current: "ISS Horizon", partner: "ISS Meridian" },
  participantB: { current: "ISS Meridian", partner: "ISS Horizon" },
};

export function MissionBriefing({ role, onProceed }: MissionBriefingProps) {
  const ships = shipByRole[role];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-300 bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-slate-900">Mission Briefing</h1>
        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
          <p>You wake to alarms and emergency lights aboard the <span className="font-semibold text-slate-900">{ships.current}</span>.</p>
          <p>A fleet-wide blackout has wiped navigation, damaged ship systems, and corrupted mission memory.</p>
          <p className="font-semibold text-slate-900">FLEET LINK PARTIALLY RESTORED</p>
          <p>
            Two ships are still responding: the <span className="font-semibold text-slate-900">{ships.current}</span>
            {" "}and the <span className="font-semibold text-slate-900">{ships.partner}</span>.
          </p>
          <p>
            Voice and video are down. Only the chat link still works.
          </p>
          <p className="font-semibold text-slate-900">NOVA ONLINE</p>
          <p>NOVA is your ship&apos;s onboard AI.</p>
          <p>
            NOVA says the two of you must work together through chat to rebuild the navigation model and restore course.
          </p>
          <p>
            Each ship has different instruments and partial information, so neither of you can solve it alone.
          </p>
          <p>Measurements cost limited reactor energy. Coordinate carefully.</p>
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
