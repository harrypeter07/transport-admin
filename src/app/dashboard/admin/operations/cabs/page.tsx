"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Search, Plus, Edit, Trash2, ChevronRight, X } from "lucide-react";

type Shift = { id: string; name: string };

export default function CabsPage() {
  const [cabs, setCabs] = useState<any[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterShift, setFilterShift] = useState("");
  const [sortBy, setSortBy] = useState("vehicleNumber");
  const [showModal, setShowModal] = useState(false);
  const [editingCab, setEditingCab] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const fetchCabs = async (q = search) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cabs?search=${encodeURIComponent(q)}`);
      if (res.ok) setCabs(await res.json());
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
    const t = setTimeout(() => fetchCabs(), 250);
    return () => clearTimeout(t);
  }, [search]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const data = new FormData(e.currentTarget);
    const payload = {
      vehicleNumber: data.get("vehicleNumber"),
      capacity: data.get("capacity"),
      vendor: data.get("vendor"),
      status: data.get("status") || "AVAILABLE",
      shiftId: data.get("shiftId") || null,
      driverName: data.get("driverName"),
      driverPhone: data.get("driverPhone"),
      licenseNumber: data.get("licenseNumber"),
    };
    try {
      const url = editingCab ? `/api/cabs/${editingCab.id}` : "/api/cabs";
      const method = editingCab ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowModal(false);
        setEditingCab(null);
        formRef.current?.reset();
        fetchCabs();
      } else {
        const err = await res.json();
        setFormError(err.error || `Failed to ${editingCab ? "update" : "register"} cab.`);
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, vn: string) => {
    if (!confirm(`Remove cab "${vn}" from the fleet?`)) return;
    try {
      const res = await fetch(`/api/cabs/${id}`, { method: "DELETE" });
      if (res.ok) fetchCabs();
    } catch (e) { console.error(e); }
  };

  let processedCabs = [...cabs];
  if (filterStatus) {
    processedCabs = processedCabs.filter((cab) => cab.status === filterStatus);
  }
  if (filterShift) {
    processedCabs = processedCabs.filter((cab) => cab.shiftId === filterShift);
  }
  processedCabs.sort((a, b) => {
    if (sortBy === "vehicleNumber") return (a.vehicleNumber || "").localeCompare(b.vehicleNumber || "");
    if (sortBy === "status") return (a.status || "").localeCompare(b.status || "");
    if (sortBy === "shift") return (a.shift?.name || "").localeCompare(b.shift?.name || "");
    return 0;
  });

  return (
    <>
      <div className="space-y-6 animate-fadeIn">
        <nav className="flex items-center gap-1.5 text-xs text-[#6b6b6b]">
        <Link href="/dashboard/admin" className="hover:text-[#1c1b1f] transition">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-[#1c1b1f]">Cabs</span>
      </nav>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-[#1c1b1f] tracking-tight">Cabs</h1>
          <p className="text-[#6b6b6b] text-sm mt-0.5">Manage transport fleet vehicles, capacities, and operational status.</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setFormError(null); }}
          className="bg-[#1c1b1f] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-black flex items-center gap-2 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Register Cab
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9a9a9a]" />
            <input
              type="text"
              placeholder="Search by vehicle number or vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-4 py-2 text-xs border border-[#e8e8e8] rounded-lg bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all"
            />
          </div>
          <div className="flex gap-2">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-[#e8e8e8] rounded-lg px-3 py-2 text-xs bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all text-[#4a4a4a]">
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="AVAILABLE">Available</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>
            <select value={filterShift} onChange={e => setFilterShift(e.target.value)} className="border border-[#e8e8e8] rounded-lg px-3 py-2 text-xs bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all text-[#4a4a4a]">
              <option value="">All Shifts</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="border border-[#e8e8e8] rounded-lg px-3 py-2 text-xs bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all text-[#4a4a4a]">
              <option value="vehicleNumber">Sort: Vehicle No</option>
              <option value="status">Sort: Status</option>
              <option value="shift">Sort: Shift</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest bg-[#f7f7f7] border-b border-[#e8e8e8]">
              <tr>
                <th className="px-5 py-3">Vehicle</th>
                <th className="px-5 py-3">Capacity</th>
                <th className="px-5 py-3">Vendor</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Shift</th>
                <th className="px-5 py-3">Driver</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-[#4a4a4a]">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-[#9a9a9a] text-xs">Loading…</td></tr>
              ) : processedCabs.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-[#9a9a9a] text-xs">No cabs match the filters.</td></tr>
              ) : (
                processedCabs.map((cab) => (
                  <tr key={cab.id} className="hover:bg-[#f7f7f7] transition-colors">
                    <td className="px-5 py-3.5 font-mono font-black text-[#1c1b1f] text-sm">{cab.vehicleNumber}</td>
                    <td className="px-5 py-3.5 font-semibold text-[#4a4a4a]">{cab.capacity} seats</td>
                    <td className="px-5 py-3.5">{cab.vendor}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide border ${
                        cab.status === "ACTIVE" ? "bg-[#1c1b1f] text-white border-slate-900" :
                        cab.status === "MAINTENANCE" ? "bg-red-50 text-red-700 border-red-200" :
                        "bg-[#f7f7f7] text-[#6b6b6b] border-[#e8e8e8]"
                      }`}>{cab.status}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {cab.shift ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#f7f7f7] text-[#4a4a4a] border border-[#e8e8e8]">{cab.shift.name}</span>
                      ) : <span className="text-[11px] text-[#9a9a9a]">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3.5 font-semibold">
                      {cab.driverName ? (
                        <>
                          <div className="text-[#1c1b1f]">{cab.driverName}</div>
                          <div className="text-[10px] text-[#6b6b6b] font-mono">{cab.driverPhone}</div>
                        </>
                      ) : <span className="font-normal text-[#9a9a9a] text-[11px]">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => {
                            setEditingCab(cab);
                            setShowModal(true);
                            setFormError(null);
                          }}
                          className="p-1.5 text-[#9a9a9a] hover:text-[#1c1b1f] hover:bg-[#f7f7f7] rounded transition"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(cab.id, cab.vehicleNumber)} className="p-1.5 text-[#9a9a9a] hover:text-red-600 hover:bg-red-50 rounded transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
      
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#1c1b1f]/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100/80 bg-white/50 sticky top-0 z-10">
              <h2 className="text-lg font-black text-[#1c1b1f] tracking-tight">
                {editingCab ? "Edit Cab Details" : "Register Cab"}
              </h2>
              <button 
                onClick={() => { setShowModal(false); setEditingCab(null); }} 
                className="p-2 rounded-full hover:bg-slate-200/50 text-[#6b6b6b] hover:text-[#1c1b1f] transition-all bg-[#f7f7f7]/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form ref={formRef} key={editingCab?.id || "new"} onSubmit={handleCreate} className="p-6 space-y-6 bg-white/40">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm font-semibold text-red-700 backdrop-blur-sm">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <CField label="Vehicle Number" name="vehicleNumber" required placeholder="MH31 AB1234" defaultValue={editingCab?.vehicleNumber} />
                <CField label="Capacity (seats)" name="capacity" required type="number" placeholder="6" defaultValue={editingCab?.capacity} />
              </div>
              <CField label="Vendor / Agency" name="vendor" required placeholder="Maharaja Transport" defaultValue={editingCab?.vendor} />
              
              <div className="border-t border-slate-100 pt-3 mt-1">
                <h3 className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest mb-3">Driver Details</h3>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <CField label="Driver Name" name="driverName" placeholder="John Doe" defaultValue={editingCab?.driverName} />
                  <CField label="Phone Number" name="driverPhone" placeholder="+91 9900000000" defaultValue={editingCab?.driverPhone} />
                </div>
                <CField label="License Number" name="licenseNumber" placeholder="DL-..." defaultValue={editingCab?.licenseNumber} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <CSelectField label="Status" name="status" required defaultValue={editingCab?.status}>
                  <option value="AVAILABLE">Available</option>
                  <option value="ACTIVE">Active</option>
                  <option value="MAINTENANCE">Maintenance</option>
                </CSelectField>
                <CSelectField label="Shift" name="shiftId" defaultValue={editingCab?.shiftId || ""}>
                  <option value="">-- No shift --</option>
                  {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </CSelectField>
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100/80">
                <button 
                  type="button" 
                  onClick={() => { setShowModal(false); setEditingCab(null); }} 
                  className="px-5 py-2.5 text-sm font-bold text-[#6b6b6b] hover:text-[#1c1b1f] border border-[#e8e8e8] rounded-xl hover:bg-[#f7f7f7] transition-all shadow-none"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-6 py-2.5 text-sm font-bold text-white bg-[#1c1b1f] hover:bg-black shadow-none shadow-slate-900/20 rounded-xl transition-all disabled:opacity-50">
                  {submitting ? (editingCab ? "Saving…" : "Registering…") : (editingCab ? "Save Changes" : "Register Cab")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function CField({ label, name, required, type = "text", placeholder, defaultValue }: any) {
  return (
    <div>
      <label className="block text-xs font-bold text-[#4a4a4a] mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue}
        className="w-full border border-[#e8e8e8] rounded-xl px-4 py-2.5 text-sm bg-[#f7f7f7]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-[#ff4f00] transition-all placeholder:text-[#9a9a9a] text-[#1c1b1f]" />
    </div>
  );
}
function CSelectField({ label, name, required, children, defaultValue }: any) {
  return (
    <div>
      <label className="block text-xs font-bold text-[#4a4a4a] mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <select name={name} required={required} defaultValue={defaultValue}
        className="w-full border border-[#e8e8e8] rounded-xl px-4 py-2.5 text-sm bg-[#f7f7f7]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-[#ff4f00] transition-all text-[#1c1b1f]">
        {children}
      </select>
    </div>
  );
}
