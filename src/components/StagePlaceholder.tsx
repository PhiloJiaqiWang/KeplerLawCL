export function StagePlaceholder() {
  return (
    <section className="h-full rounded-lg border border-slate-300 bg-slate-100 p-4">
      <h2 className="text-lg font-semibold text-slate-900">Stage Placeholder</h2>
      <p className="mt-2 text-sm text-slate-600">
        Stage-specific tasks and instructions will be added here in a later iteration.
      </p>
      <div className="mt-4 flex h-[240px] items-center justify-center rounded-md border border-dashed border-slate-400 bg-white text-sm text-slate-500">
        Stage content placeholder
      </div>
    </section>
  );
}
