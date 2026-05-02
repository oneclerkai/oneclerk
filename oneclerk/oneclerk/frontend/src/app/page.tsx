import Link from 'next/link';

export default function RootPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <p className="mb-4 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm text-indigo-700">
          OneClerk.ai
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Never miss a customer call again
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          AI voice receptionist for booking, call routing, and support - ready 24/7 for your business.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/signup" className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700">
            Start free trial
          </Link>
          <Link href="/login" className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-100">
            Log in
          </Link>
        </div>
      </section>
    </main>
  );
}
