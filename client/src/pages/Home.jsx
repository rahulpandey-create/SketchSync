import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Users, Sparkles, Lock, PenLine } from "lucide-react";

const features = [
  {
    icon: PenLine,
    title: "Real-time drawing",
    description: "Sketch together on the same board with live sync for every stroke.",
  },
  {
    icon: Users,
    title: "Multi-user rooms",
    description: "Create a room, share the link, and collaborate instantly.",
  },
  {
    icon: Lock,
    title: "Room-based isolation",
    description: "Each board stays private to its own room and participants.",
  },
  {
    icon: Sparkles,
    title: "Built to scale",
    description: "A clean foundation for future tools like shapes, text, and export.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <section className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              SketchSync v1
            </div>

            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Draw together in real time without the chaos.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                SketchSync is a collaborative whiteboard for fast ideas, team brainstorming, and live visual thinking.
                Create a room, share the link, and start drawing immediately.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/board"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open board
                <ArrowRight className="h-4 w-4" />
              </Link>

              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100"
              >
                Explore features
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-semibold">Live</p>
                <p className="mt-1 text-sm text-slate-600">Sync strokes instantly</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-semibold">Simple</p>
                <p className="mt-1 text-sm text-slate-600">Focused v1 experience</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-semibold">Scalable</p>
                <p className="mt-1 text-sm text-slate-600">Ready for upgrades later</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Preview</p>
                <h2 className="mt-1 text-xl font-semibold">Clean whiteboard workspace</h2>
              </div>
              <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">
                Room-based
              </div>
            </div>

            <div className="mt-6 rounded-3xl bg-slate-50 p-4">
              <div className="grid gap-4 md:grid-cols-2" id="features">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <article
                      key={feature.title}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl bg-slate-900 p-3 text-white">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold">{feature.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{feature.description}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-700">Best next step</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Start with v1: room join, local drawing, and live sync. Then add persistence, undo, shapes, and export in later versions.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


