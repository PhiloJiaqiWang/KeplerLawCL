import type { EventLog } from "@/lib/types";

type EventLoggerProps = {
  eventLogs: EventLog[];
};

export function EventLogger({ eventLogs }: EventLoggerProps) {
  return (
    <section className="rounded-lg border border-slate-300 bg-white p-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Event Log</h3>
      <div className="mt-2 max-h-40 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2">
        {eventLogs.length === 0 ? (
          <p className="text-sm text-slate-500">No events yet.</p>
        ) : (
          <ul className="space-y-1 text-sm text-slate-700">
            {eventLogs.map((event) => (
              <li key={event.id}>
                [{new Date(event.createdAt).toLocaleTimeString()}] {event.type}: {event.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
