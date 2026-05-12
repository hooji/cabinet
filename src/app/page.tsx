"use client";

export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Agent Bridge</h1>
        <p className="text-sm text-muted-foreground">
          UI shell ready. Java bridge not yet connected.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs">
          <span className="size-2 rounded-full bg-amber-500" />
          <span>disconnected</span>
        </div>
      </div>
    </main>
  );
}
