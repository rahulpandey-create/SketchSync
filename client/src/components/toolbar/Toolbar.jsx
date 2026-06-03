import React from "react";
import { Eraser, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";

const DEFAULT_SWATCHES = [
  "#111827",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];


export default function Toolbar({

  tool,
  setTool,
  color,
  setColor,
  size,
  setSize,
  onClear,
  onUndo,
  onRedo,
  disabled = false,
  swatches = DEFAULT_SWATCHES,
}) {
  
  console.log("TOOLBAR DISABLED PROP:", disabled);
  
  const isPen = tool === "pen";
  const isEraser = tool === "eraser";

  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTool("pen")}
          disabled={disabled}
          aria-pressed={isPen}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
            isPen
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <Pencil className="h-4 w-4" />
          Pen
        </button>

        <button
          type="button"
          onClick={() => setTool("eraser")}
          disabled={disabled}
          aria-pressed={isEraser}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
            isEraser
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <Eraser className="h-4 w-4" />
          Eraser
        </button>

        <button
          type="button"
          onClick={onUndo}
          disabled={disabled}
          className={`inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
        >
          <Undo2 className="h-4 w-4" />
          Undo
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={disabled}
          className={`inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
        >
          <Redo2 className="h-4 w-4" />
          Redo
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className={`inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-600 ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
        <div className="flex flex-wrap items-center gap-2">
          {swatches.map((swatch) => {
            const active = color.toLowerCase() === swatch.toLowerCase();

            return (
              <button
                key={swatch}
                type="button"
                disabled={disabled || isEraser}
                onClick={() => setColor(swatch)}
                aria-label={`Select color ${swatch}`}
                aria-pressed={active}
                className={`h-8 w-8 rounded-full border-2 transition ${
                  active ? "scale-110 border-slate-900" : "border-white"
                } ${disabled || isEraser ? "cursor-not-allowed opacity-50" : "hover:scale-110"}`}
                style={{ backgroundColor: swatch }}
              />
            );
          })}

          <label className="ml-1 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
            <span>Custom</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={disabled || isEraser}
              className="h-7 w-7 cursor-pointer rounded-md border border-slate-200 bg-transparent p-0"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-slate-100 px-3 py-2">
          <label htmlFor="brush-size" className="text-sm font-medium text-slate-700">
            Size
          </label>
          <input
            id="brush-size"
            type="range"
            min="1"
            max="40"
            step="1"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            disabled={disabled}
            className="w-40 cursor-pointer accent-slate-900"
          />
          <span className="min-w-8 text-sm font-semibold text-slate-900">{size}px</span>
        </div>
      </div>
    </div>
  );
}