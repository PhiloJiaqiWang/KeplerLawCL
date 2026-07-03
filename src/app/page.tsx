export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form
        action="/enter"
        method="get"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-semibold text-slate-900">Un-orbit</h1>
        <p className="mt-2 text-sm text-slate-600">Enter a Room ID to continue.</p>
        <input
          name="roomId"
          placeholder="e.g. study-room-01"
          className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-slate-300 focus:ring"
        />
        <button className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2 text-white">Enter Room</button>
      </form>
    </main>
  );
}
