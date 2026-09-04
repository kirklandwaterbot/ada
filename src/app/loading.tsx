export default function Loading() {
  return (
    <div aria-label="Loading page" className="animate-pulse space-y-8" role="status">
      <div className="space-y-3">
        <div className="h-3 w-32 rounded-full bg-[var(--border)]" />
        <div className="h-10 w-full max-w-xl rounded-xl bg-[var(--border)]" />
        <div className="h-5 w-full max-w-2xl rounded-lg bg-[var(--border)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="surface-card h-36 bg-[var(--panel)] p-5" key={index}>
            <div className="h-3 w-24 rounded-full bg-[var(--border)]" />
            <div className="mt-7 h-9 w-20 rounded-lg bg-[var(--border)]" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.6fr]">
        <div className="surface-card h-96 bg-[var(--panel)]" />
        <div className="surface-card h-96 bg-[var(--panel)]" />
      </div>
      <span className="sr-only">Loading accessibility data...</span>
    </div>
  );
}
