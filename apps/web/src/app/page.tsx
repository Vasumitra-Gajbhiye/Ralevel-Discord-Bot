export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">r/alevel</h1>
        <p className="text-sm text-zinc-500">
          Web app scaffold. Shared DB is available via{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
            @ralevel/db
          </code>
          .
        </p>
      </div>
    </main>
  );
}
