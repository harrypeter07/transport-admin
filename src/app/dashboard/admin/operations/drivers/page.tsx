"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Search, Plus, Edit, Trash2, ChevronRight, X } from "lucide-react";

type Shift = { id: string; name: string };

export default function DriversPage() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const fetchDrivers = async (q = search) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/drivers?search=${encodeURIComponent(q)}`);
      if (res.ok) setDrivers(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchShifts = async () => {
    try {
      const res = await fetch("/api/shifts");
      if (res.ok) setShifts(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchShifts(); }, []);
  useEffect(() => {
    const t = setTimeout(() => fetchDrivers(), 250);
    return () => clearTimeout(t);
  }, [search]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const data = new FormData(e.currentTarget);
    const payload = {
      name: data.get("name"),
      phone: data.get("phone"),
      licenseNumber: data.get("licenseNumber"),
      vendor: data.get("vendor") || null,
      status: data.get("status") || "AVAILABLE",
      shiftId: data.get("shiftId") || null,
    };
    try {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowModal(false);
        formRef.current?.reset();
        fetchDrivers();
      } else {
        const err = await res.json();
        setFormError(err.error || "Failed to create driver.");
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete driver "${name}"?`)) return;
    try {
      const res = await fetch(`/api/drivers/${id}`, { method: "DELETE" });
      if (res.ok) fetchDrivers();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/dashboard/admin" className="hover:text-slate-900 transition">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-900">Drivers</span>
      </nav>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Drivers</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage transport fleet drivers and vendor assignments.</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setFormError(null); }}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-2 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Add Driver
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, phone, or vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-4 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Driver</th>
                <th className="px-5 py-3">Vendor</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Shift</th>
                <th className="px-5 py-3">Assigned Cab</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-xs">Loading…</td></tr>
              ) : drivers.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-xs">No drivers found. Click &ldquo;Add Driver&rdquo; to create one.</td></tr>
              ) : (
                drivers.map((drv) => (
                  <tr key={drv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{drv.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">DL: {drv.licenseNumber} · {drv.phone}</div>
                    </td>
                    <td className="px-5 py-3.5">{drv.vendor ?? <span className="italic text-slate-400">Independent</span>}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide border ${
                        drv.status === "ACTIVE" ? "bg-slate-900 text-white border-slate-900" :
                        drv.status === "OFF_DUTY" ? "bg-slate-100 text-slate-600 border-slate-200" :
                        "bg-slate-50 text-slate-600 border-slate-200"
                      }`}>{drv.status}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {drv.shift ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">{drv.shift.name}</span>
                      ) : <span className="text-[11px] text-slate-400">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-800">
                      {drv.cab?.vehicleNumber ?? <span className="font-normal text-slate-400 font-sans text-[11px]">None</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(drv.id, drv.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-widest">Add Driver</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"><X className="w-4 h-4" /></button>
            </div>
            <form ref={formRef} onSubmit={handleCreate} className="p-5 space-y-4">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">{formError}</div>
              )}
              <MField label="Full Name" name="name" required placeholder="Rajesh Kumar" />
              <div className="grid grid-cols-2 gap-4">
                <MField label="Phone" name="phone" required placeholder="+91 98765 43210" />
                <MField label="License Number" name="licenseNumber" required placeholder="MH31-XXXXXX" />
              </div>
              <MField label="Vendor / Agency" name="vendor" placeholder="Maharaja Transport" />
              <div className="grid grid-cols-2 gap-4">
                <MSelectField label="Status" name="status" required>
                  <option value="AVAILABLE">Available</option>
                  <option value="ACTIVE">Active</option>
                  <option value="OFF_DUTY">Off Duty</option>
                </MSelectField>
                <MSelectField label="Shift" name="shiftId">
                  <option value="">-- No shift --</option>
                  {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </MSelectField>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 mt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition disabled:opacity-50">
                  {submitting ? "Creating…" : "Create Driver"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MField({ label, name, required, type = "text", placeholder }: any) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input name={name} type={type} required={required} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all" />
    </div>
  );
}
function MSelectField({ label, name, required, children }: any) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <select name={name} required={required}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all">
        {children}
      </select>
    </div>
  );
}
