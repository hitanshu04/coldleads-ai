"use client";

import { useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

type LeadResult = {
  cto: string;
  email_draft: string;
  company_pulse?: string;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LeadResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a company URL.");
      return;
    }
    let finalUrl = trimmed;
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/generate-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
            ? data.detail.map((x: { msg?: string }) => x.msg).join(", ")
            : "Failed to generate lead.";
        throw new Error(msg);
      }
      setResult({
        cto: data.cto ?? "the CTO",
        email_draft: data.email_draft ?? "",
        company_pulse: data.company_pulse ?? "No recent news found.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function copyEmail() {
    if (!result?.email_draft) return;
    navigator.clipboard.writeText(result.email_draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function draftInGmail() {
    if (!result?.email_draft) return;
    const subject = encodeURIComponent("GenAI Intern Application - Automating your internal workflows");
    const body = encodeURIComponent(result.email_draft);
    // Opens Gmail in a new tab with Subject and Body filled
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=&su=${subject}&body=${body}`, '_blank');
  }

  // FIXED: Cleaner logic for displaying the role label
  const getRoleLabel = () => {
    if (!result?.cto) return "—";
    const rawName = result.cto;
    
    // If it's the fallback generic name, don't append "— CTO"
    if (rawName.toLowerCase().includes("hiring manager")) {
      return "The Hiring Manager";
    }
    // If the name already has CTO in it, don't duplicate
    if (rawName.toLowerCase().includes("cto")) {
      return rawName;
    }
    // Otherwise, append the title
    return `${rawName} — CTO`;
  };

  const roleLabel = getRoleLabel();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none"
        aria-hidden
      />

      <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
          {/* Hero */}
          <header className="text-center mb-10 sm:mb-12">
            <h1 className="text-5xl font-semibold tracking-tight text-white text-balance">
              ColdLeads AI
            </h1>
            <p className="mt-3 text-slate-400 text-base max-w-lg mx-auto">
              One URL. One click. A personalized cold email to the right decision-maker.
            </p>
          </header>

          {/* Form card */}
          <div className="w-full">
            <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 sm:p-8 glow-ring">
              <label htmlFor="company-url" className="block text-sm font-medium text-slate-300 mb-2">
                Company URL
              </label>
              <input
                id="company-url"
                type="url"
                placeholder="https://swiggy.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                className="glow-ring-focus w-full rounded-xl bg-slate-900/80 border border-slate-700/80 px-4 py-4 text-slate-100 placeholder-slate-500 transition shadow-[0_0_20px_-4px_rgba(59,130,246,0.12)] disabled:opacity-60 disabled:cursor-not-allowed"
                autoComplete="url"
              />
              <button
                type="submit"
                disabled={loading}
                className="mt-5 w-full rounded-xl bg-blue-500 px-6 py-4 font-semibold text-white shadow-[0_0_24px_-4px_rgba(59,130,246,0.4)] hover:bg-blue-600 hover:shadow-[0_0_32px_-4px_rgba(59,130,246,0.35)] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:bg-blue-500 transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Generating…
                  </>
                ) : (
                  "Generate Lead"
                )}
              </button>
            </form>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-red-300 text-sm"
              >
                {error}
              </div>
            )}

            {/* Results card — hidden until generated */}
            {result && (
              <div className="mt-8 glass rounded-2xl p-6 sm:p-8 border border-slate-700/50 space-y-6">
                <h2 className="text-lg font-semibold text-slate-200 border-b border-slate-700/50 pb-2">
                  Lead summary
                </h2>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">
                    Target Identity
                  </p>
                  <p className="text-slate-100 font-medium">{roleLabel}</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">
                    Company Pulse
                  </p>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {result.company_pulse || "No recent news found."}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      The Email
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={draftInGmail}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-600/60 bg-slate-800/40 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/50 transition"
                      >
                         <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                         </svg>
                         Draft in Gmail
                      </button>
                      <button
                        type="button"
                        onClick={copyEmail}
                        className="rounded-lg bg-slate-800/80 border border-slate-600/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700/80 hover:text-white transition"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <pre className="rounded-xl bg-slate-900/90 border border-slate-700/60 p-4 text-sm text-slate-200 whitespace-pre-wrap font-mono overflow-x-auto max-h-80 overflow-y-auto">
                    {result.email_draft}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}