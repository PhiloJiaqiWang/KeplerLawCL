"use client";

import { useState } from "react";
import type { ParticipantRole, RoomState } from "@/lib/types";

type RoleSelectorProps = {
  room: RoomState;
  onSelect: (role: ParticipantRole, name: string) => Promise<void>;
};

export function RoleSelector({ room, onSelect }: RoleSelectorProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pendingRole, setPendingRole] = useState<ParticipantRole | null>(null);

  const handleSelect = async (role: ParticipantRole) => {
    if (!name.trim()) {
      setError("Please enter your name before selecting a role.");
      return;
    }

    setError("");
    setPendingRole(role);
    try {
      await onSelect(role, name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select role.");
    } finally {
      setPendingRole(null);
    }
  };

  const cards: Array<{ role: ParticipantRole; label: string; occupiedBy: string | null }> = [
    { role: "participantA", label: "Participant A", occupiedBy: room.participantA?.name ?? null },
    { role: "participantB", label: "Participant B", occupiedBy: room.participantB?.name ?? null },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Select a Role</h1>
      <p className="text-sm text-slate-600">Room: {room.roomId}</p>
      <p className="text-xs text-slate-500">
        If you previously joined, enter the same display name and select your original role to rejoin.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Display Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          className="rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const occupied = Boolean(card.occupiedBy);
          const canAttemptRejoin = occupied && name.trim().length > 0;
          return (
            <button
              key={card.role}
              disabled={pendingRole !== null}
              onClick={() => handleSelect(card.role)}
              className="rounded-lg border border-slate-300 p-4 text-left transition enabled:hover:border-slate-500 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <p className="text-base font-semibold text-slate-900">{card.label}</p>
              <p className="mt-2 text-sm text-slate-600">
                {occupied ? `Taken by ${card.occupiedBy}` : "Available"}
              </p>
              {canAttemptRejoin ? (
                <p className="mt-1 text-xs text-slate-500">
                  Enter the same display name to rejoin this role.
                </p>
              ) : null}
              {pendingRole === card.role ? (
                <p className="mt-2 text-xs text-slate-500">Joining...</p>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
