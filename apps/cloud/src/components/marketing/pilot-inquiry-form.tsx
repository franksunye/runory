"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const fields = [
  { name: "name", label: "Name", placeholder: "Your name", required: true },
  { name: "email", label: "Work email", placeholder: "you@company.com", required: true, type: "email" },
  { name: "company", label: "Company", placeholder: "Company name", required: true },
  { name: "industry", label: "Service industry", placeholder: "HVAC, repair, installation..." },
  { name: "teamSize", label: "Team size", placeholder: "1–10, 11–50, 51+" },
] as const;

export function PilotInquiryForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/pilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Submission failed");
      event.currentTarget.reset();
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-[28px] border border-black/10 bg-white p-8 sm:p-10">
        <CheckCircle2 className="text-orange-600" size={30} />
        <h2 className="mt-5 font-serif text-3xl tracking-[-.03em]">Your pilot request is in.</h2>
        <p className="mt-3 max-w-lg leading-7 text-neutral-600">We will review the workflow and contact you using the work email provided.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_70px_rgba(50,35,20,.08)] sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.name} className="text-sm font-semibold text-neutral-800">
            {field.label}
            <input
              name={field.name}
              type={field.type || "text"}
              required={field.required}
              placeholder={field.placeholder}
              className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-[#fbf8f1] px-4 text-sm outline-none transition focus:border-orange-500"
            />
          </label>
        ))}
      </div>
      <label className="mt-5 block text-sm font-semibold text-neutral-800">
        Priority workflow or operational problem
        <textarea
          name="workflow"
          required
          rows={5}
          placeholder="Describe the process you want to improve, the current tools, and the desired outcome."
          className="mt-2 w-full rounded-xl border border-black/10 bg-[#fbf8f1] px-4 py-3 text-sm leading-6 outline-none transition focus:border-orange-500"
        />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {status === "error" && <p className="mt-4 text-sm text-red-700">{message}</p>}
      <button disabled={status === "submitting"} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-orange-600 px-7 font-semibold text-white disabled:opacity-60">
        {status === "submitting" ? "Submitting..." : "Submit Pilot Request"} <ArrowRight size={18} />
      </button>
      <p className="mt-4 text-xs leading-5 text-neutral-500">We use this information only to assess and respond to your pilot request.</p>
    </form>
  );
}
