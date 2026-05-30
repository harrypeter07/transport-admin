"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Plus, Edit, Trash2, ChevronRight, X, Users, CarFront, Bus, Clock } from "lucide-react";

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shifts");
      if (res.ok) setShifts(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchShifts(); }, []);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const data = new FormData(e.currentTarget);
    const payload = {
      name: data.get("name"),
      startTime: data.get("startTime"),
      endTime: data.get("endTime"),
    };
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowModal(false);
        formRef.current?.reset();
        fetchShifts();
      } else {
        const err = await res.json();
        setFormError(err.error || "Failed to create shift.");
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete shift "${name}"? This will unassign all employees, drivers, and cabs.`)) return;
    try {
      const res = await fetch(`/api/shifts/${id}`, { method: "DELETE" });
      if (res.ok) fetchShifts();
    } catch (e) { console.error(e); }
  };

  return (
    <>
      <div className="space-y-6 animate-fadeIn">
        <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/dashboard/admin" className="hover:text-slate-900 transition">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-900">Shifts</span>
      </nav>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Shifts</h1>
          <p className="text-slate-500 text-sm mt-0.5">Configure work shifts and view allocated resources per shift.</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setFormError(null); }}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-2 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Add Shift
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-sm">Loading shifts…</div>
        ) : shifts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-sm">
            No shifts configured yet. Click &ldquo;Add Shift&rdquo; to create one.
          </div>
        ) : (
          shifts.map((shift) => (
            <div key={shift.id} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-5 border-b border-slate-100 flex justify-between items-start">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{shift.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    {shift.startTime} → {shift.endTime}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition"><Edit className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(shift.id, shift.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="p-5 bg-slate-50 flex flex-col gap-4">
                <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Resources</div>
                  <div className="space-y-2">
                    {[
                      { Icon: Users, label: "Employees", count: shift._count?.employees ?? 0 },
                      { Icon: CarFront, label: "Drivers", count: shift._count?.drivers ?? 0 },
                      { Icon: Bus, label: "Cabs", count: shift._count?.cabs ?? 0 },
                    ].map(({ Icon, label, count }) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="flex items-center gap-2 text-xs text-slate-600">
                          <Icon className="w-3.5 h-3.5 text-slate-400" /> {label}
                        </span>
                        <span className="text-xs font-black text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded-md">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {shift.cabs && shift.cabs.length > 0 && (
                  <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-t border-slate-200 pt-3">Assigned Cabs</div>
                    <div className="grid grid-cols-1 gap-2">
                      {shift.cabs.map((cab: any) => (
                        <div key={cab.id} className="bg-white border border-slate-200 rounded-lg p-2.5 flex justify-between items-center shadow-xs">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-black font-mono text-slate-900">{cab.vehicleNumber}</span>
                            <span className="text-[9px] text-slate-500 font-semibold">{cab.vendor} · {cab.capacity} seats</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-bold text-slate-700">{cab.driverName || "No Driver"}</span>
                            <span className="text-[9px] text-slate-400 font-mono">{cab.driverPhone || "N/A"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      </div>
      
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100/80 bg-white/50 sticky top-0 z-10">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Add Shift</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-slate-200/50 text-slate-500 hover:text-slate-900 transition-all bg-slate-100/50"><X className="w-5 h-5" /></button>
            </div>
            <form ref={formRef} onSubmit={handleCreate} className="p-6 space-y-6 bg-white/40">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm font-semibold text-red-700 backdrop-blur-sm">{formError}</div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Shift Name<span className="text-red-500 ml-0.5">*</span></label>
                <input name="name" required placeholder="Morning Shift" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-500 transition-all placeholder:text-slate-400 text-slate-900" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Start Time<span className="text-red-500 ml-0.5">*</span></label>
                  <input name="startTime" type="time" required className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-500 transition-all placeholder:text-slate-400 text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">End Time<span className="text-red-500 ml-0.5">*</span></label>
                  <input name="endTime" type="time" required className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-500 transition-all placeholder:text-slate-400 text-slate-900" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100/80">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="px-6 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md shadow-slate-900/20 rounded-xl transition-all disabled:opacity-50">
                  {submitting ? "Creating…" : "Create Shift"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
