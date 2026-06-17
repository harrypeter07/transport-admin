"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Search, Plus, Edit, Trash2, ChevronRight, X } from "lucide-react";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import { useTransportStore } from "@/store/useTransportStore";
import ConfirmModal from "@/components/ConfirmModal";
import { ZONE_COLORS } from "@/lib/zones";

type Shift = { id: string; name: string };

export default function EmployeesPage() {
 const [employees, setEmployees] = useState<any[]>([]);
 const [shifts, setShifts] = useState<Shift[]>([]);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState("");
 const [filterRole, setFilterRole] = useState("");
 const [filterShift, setFilterShift] = useState("");
 const [filterZone, setFilterZone] = useState("");
 const [filterSubZone, setFilterSubZone] = useState("");
 const [filterDistanceRing, setFilterDistanceRing] = useState("");
 const [filterHasPickup, setFilterHasPickup] = useState<"" | "yes" | "no">("");
 const [filterIsolated, setFilterIsolated] = useState(false);
 const [showZoneColumns, setShowZoneColumns] = useState(false);
 const { optimizationPlans, isolatedEmployeeIds } = useTransportStore();
 const [sortBy, setSortBy] = useState("name");
 const [showModal, setShowModal] = useState(false);
 const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [autoAddress, setAutoAddress] = useState<{ displayName?: string; placeId?: string; lat?: number; lon?: number } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

 const fetchEmployees = async (q = search) => {
 setLoading(true);
 try {
 const res = await fetch(`/api/employees?search=${encodeURIComponent(q)}`);
 if (res.ok) setEmployees(await res.json());
 } catch (e) {
 console.error(e);
 } finally {
 setLoading(false);
 }
 };

 const fetchShifts = async () => {
 try {
 const res = await fetch("/api/shifts");
 if (res.ok) setShifts(await res.json());
 } catch (e) {
 console.error(e);
 }
 };

 useEffect(() => {
 fetchShifts();
 }, []);

 useEffect(() => {
 const t = setTimeout(() => fetchEmployees(), 250);
 return () => clearTimeout(t);
 }, [search]);

  const [empToDelete, setEmpToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  setSubmitting(true);
  setFormError(null);
  const data = new FormData(e.currentTarget);
  const payload = {
  employeeCode: data.get("employeeCode"),
  name: data.get("name"),
  gender: data.get("gender"),
  phone: data.get("phone"),
  email: data.get("email"),
  address: data.get("address"),
  formattedAddress: autoAddress?.displayName || data.get("address"),
  placeId: autoAddress?.placeId || null,
  lat: autoAddress?.lat ?? null,
  lon: autoAddress?.lon ?? null,
  department: data.get("department"),
  designation: data.get("designation"),
  managerId: data.get("managerId") || null,
  shiftId: data.get("shiftId") || null,
  ...(editingEmployee && { id: editingEmployee.id })
  };
  try {
 const url = "/api/employees";
 const method = editingEmployee ? "PATCH" : "POST";
 const res = await fetch(url, {
 method,
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 });
  if (res.ok) {
  setShowModal(false);
  setEditingEmployee(null);
  formRef.current?.reset();
  fetchEmployees();
  // Refresh routes in shared store for map consistency
  const { selectedDate, setRoutes } = useTransportStore.getState();
  const date = selectedDate || new Date().toISOString().split("T")[0];
  fetch(`/api/optimization?date=${date}`)
    .then(r => r.json())
    .then(data => setRoutes(Array.isArray(data) ? data : []))
    .catch(() => {});
  } else {
 const err = await res.json();
 setFormError(err.error || `Failed to ${editingEmployee ? "update" : "create"} employee.`);
 }
 } catch {
 setFormError("Network error. Please try again.");
 } finally {
 setSubmitting(false);
 }
 };

 const handleDelete = async (id: string) => {
 try {
 const res = await fetch(`/api/employees?id=${id}`, { method: "DELETE" });
 if (res.ok) fetchEmployees();
 else {
 const err = await res.json();
 alert(err.error || "Failed to delete employee");
 }
 } catch (e) {
 console.error(e);
 alert("Network error while deleting");
 }
 };

 let processedEmployees = [...employees];
 if (filterRole) {
 processedEmployees = processedEmployees.filter((emp) => emp.designation === filterRole);
 }
 if (filterShift) {
 processedEmployees = processedEmployees.filter((emp) => emp.shiftId === filterShift);
 }
 if (filterZone) {
 processedEmployees = processedEmployees.filter((emp) => emp.zone === filterZone);
 }
 if (filterSubZone) {
 processedEmployees = processedEmployees.filter((emp) => emp.subZone === filterSubZone);
 }
 if (filterDistanceRing) {
 processedEmployees = processedEmployees.filter((emp) => emp.distanceRing === filterDistanceRing);
 }
 if (filterHasPickup === "yes") {
 processedEmployees = processedEmployees.filter((emp) => !!emp.pickupPointId);
 } else if (filterHasPickup === "no") {
 processedEmployees = processedEmployees.filter((emp) => !emp.pickupPointId);
 }
 if (filterIsolated && optimizationPlans?.isolatedEmployees?.length) {
 const isolatedIds = new Set(optimizationPlans.isolatedEmployees.map((i) => i.employeeId));
 processedEmployees = processedEmployees.filter((emp) => isolatedIds.has(emp.id));
 }
 processedEmployees.sort((a, b) => {
 if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
 if (sortBy === "role") return (a.designation || "").localeCompare(b.designation || "");
 if (sortBy === "shift") return (a.shift?.name || "").localeCompare(b.shift?.name || "");
 return 0;
 });

 return (
 <>
 <div className="space-y-6 animate-fadeIn">
 {/* Breadcrumb */}
 <nav className="flex items-center gap-1.5 text-xs text-[#6b6b6b]">
 <Link href="/dashboard/admin" className="hover:text-[#1c1b1f] transition">Dashboard</Link>
 <ChevronRight className="w-3 h-3" />
 <span className="font-semibold text-[#1c1b1f]">Employees</span>
 </nav>

 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
 <div>
 <h1 className="text-xl font-extrabold text-[#1c1b1f] tracking-tight">Employees</h1>
 <p className="text-[#6b6b6b] text-sm mt-0.5">Manage workforce, designations, and reporting structure.</p>
 </div>
 <button
  onClick={() => { setShowModal(true); setFormError(null); setAutoAddress(null); }}  
 className="bg-[#1c1b1f] text-white px-4 py-2 rounded-none text-xs font-bold hover:bg-black flex items-center gap-2 transition"
 >
 <Plus className="w-3.5 h-3.5" /> Add Employee
 </button>
 </div>

 {/* Table card */}
 <div className="bg-white rounded-none border border-[#e8e8e8] shadow-xs overflow-hidden">
 <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3">
 <div className="relative w-full sm:flex-1 sm:max-w-sm">
 <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9a9a9a]" />
 <input
 type="text"
 placeholder="Search by name, ID, or department..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="w-full pl-8 pr-4 py-2 text-xs border border-[#e8e8e8] rounded-none bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all"
 />
 </div>
 <div className="flex flex-wrap gap-2">
 <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="border border-[#e8e8e8] rounded-none px-3 py-2 text-xs bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all text-[#4a4a4a]">
 <option value="">All Roles</option>
 <option value="Manager">Manager</option>
 <option value="Senior Manager">Senior Manager</option>
 <option value="Engineer">Engineer</option>
 <option value="Driver">Driver</option>
 </select>
 <select value={filterShift} onChange={e => setFilterShift(e.target.value)} className="border border-[#e8e8e8] rounded-none px-3 py-2 text-xs bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all text-[#4a4a4a]">
 <option value="">All Shifts</option>
 {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
 </select>
 <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="border border-[#e8e8e8] rounded-none px-3 py-2 text-xs bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all text-[#4a4a4a]">
 <option value="name">Sort: Name</option>
 <option value="role">Sort: Role</option>
 <option value="shift">Sort: Shift</option>
 </select>
 <select value={filterZone} onChange={e => setFilterZone(e.target.value)} className="border border-[#e8e8e8] rounded-none px-3 py-2 text-xs bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all text-[#4a4a4a]">
 <option value="">All Zones</option>
 <option value="N">N</option>
 <option value="S">S</option>
 <option value="E">E</option>
 <option value="W">W</option>
 </select>
 <select value={filterSubZone} onChange={e => setFilterSubZone(e.target.value)} className="border border-[#e8e8e8] rounded-none px-3 py-2 text-xs bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all text-[#4a4a4a]">
 <option value="">All Sub-zones</option>
 <option value="NE">NE</option>
 <option value="NW">NW</option>
 <option value="SE">SE</option>
 <option value="SW">SW</option>
 </select>
 <select value={filterDistanceRing} onChange={e => setFilterDistanceRing(e.target.value)} className="border border-[#e8e8e8] rounded-none px-3 py-2 text-xs bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all text-[#4a4a4a]">
 <option value="">All Rings</option>
 <option value="NEAR">Near (0–5 km)</option>
 <option value="MID">Mid (5–15 km)</option>
 <option value="FAR">Far (15+ km)</option>
 </select>
 <select value={filterHasPickup} onChange={e => setFilterHasPickup(e.target.value as "" | "yes" | "no")} className="border border-[#e8e8e8] rounded-none px-3 py-2 text-xs bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all text-[#4a4a4a]">
 <option value="">Pickup point: Any</option>
 <option value="yes">Has pickup point</option>
 <option value="no">Door pickup</option>
 </select>
 <label className="flex items-center gap-1.5 px-2 py-1 text-xs text-[#4a4a4a] border border-[#e8e8e8] bg-[#f7f7f7] cursor-pointer">
 <input type="checkbox" checked={filterIsolated} onChange={e => setFilterIsolated(e.target.checked)} className="rounded-none" />
 Isolated only
 </label>
 <label className="flex items-center gap-1.5 px-2 py-1 text-xs text-[#4a4a4a] border border-[#e8e8e8] bg-[#f7f7f7] cursor-pointer">
 <input type="checkbox" checked={showZoneColumns} onChange={e => setShowZoneColumns(e.target.checked)} className="rounded-none" />
 Zone cols
 </label>
 </div>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest bg-[#f7f7f7] border-b border-[#e8e8e8]">
 <tr>
 <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Address</th>
                  <th className="px-5 py-3">Designation</th>
 <th className="px-5 py-3">Shift</th>
 <th className="px-5 py-3">Pickup</th>
 {showZoneColumns && (
   <>
     <th className="px-5 py-3">Zone</th>
     <th className="px-5 py-3">Sub-zone</th>
     <th className="px-5 py-3">Ring</th>
     <th className="px-5 py-3">Dist km</th>
   </>
 )}
 <th className="px-5 py-3">Manager</th>
 <th className="px-5 py-3 text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100 text-sm text-[#4a4a4a]">
 {loading ? (
                  <tr><td colSpan={showZoneColumns ? 12 : 8} className="px-5 py-10 text-center text-[#9a9a9a] text-xs">Loading…</td></tr>
                ) : processedEmployees.length === 0 ? (
                  <tr><td colSpan={showZoneColumns ? 12 : 8} className="px-5 py-12 text-center text-[#9a9a9a] text-xs">No employees match the filters.</td></tr>
 ) : (
 processedEmployees.map((emp) => (
 <tr key={emp.id} className="hover:bg-[#f7f7f7] transition-colors">
 <td className="px-5 py-3.5">
 <div className="font-semibold text-[#1c1b1f]">{emp.name}</div>
 <div className="text-[11px] text-[#9a9a9a] mt-0.5 font-mono">{emp.employeeCode} · {emp.gender}</div>
 </td>
                  <td className="px-5 py-3.5">
                    <div>{emp.email}</div>
                    <div className="text-[#9a9a9a] mt-0.5">{emp.phone}</div>
                  </td>
                  <td className="px-5 py-3.5 max-w-[160px]">
                    <div className="truncate text-[11px] text-[#4a4a4a]" title={emp.formattedAddress || emp.address}>{emp.formattedAddress || emp.address}</div>
                  </td>
                  <td className="px-5 py-3.5">
 <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#f7f7f7] text-[#4a4a4a] border border-[#e8e8e8] uppercase tracking-wide">
 {emp.designation || "Engineer"}
 </span>
 <div className="text-[11px] text-[#9a9a9a] mt-1">{emp.department}</div>
 </td>
 <td className="px-5 py-3.5">
 {emp.shift ? (
 <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#1c1b1f] text-white border border-[#1c1b1f]">
 {emp.shift.name}
 </span>
 ) : (
 <span className="text-[#9a9a9a] text-[11px]">Unassigned</span>
 )}
 </td>
 <td className="px-5 py-3.5">
   {emp.pickupPoint ? (
     <span className="inline-flex px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
       {emp.pickupPoint.name}
     </span>
   ) : isolatedEmployeeIds.includes(emp.id) ? (
     <span className="inline-flex px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
       Isolated ⚠
     </span>
   ) : (
     <span className="text-[10px] text-[#9a9a9a]">Door pickup</span>
   )}
 </td>
 {showZoneColumns && (
   <>
     <td className="px-5 py-3.5">
       {emp.zone ? (
         <span
           className="inline-flex px-2 py-0.5 text-[10px] font-black uppercase text-white"
           style={{ backgroundColor: ZONE_COLORS[emp.zone] || "#64748b" }}
         >
           {emp.zone}
         </span>
       ) : (
         <span className="text-[#9a9a9a]">—</span>
       )}
     </td>
     <td className="px-5 py-3.5 font-mono text-[11px]">{emp.subZone || "—"}</td>
     <td className="px-5 py-3.5 font-mono text-[10px]">{emp.distanceRing || "—"}</td>
     <td className="px-5 py-3.5 font-mono text-[11px]">
       {emp.distanceFromDepotKm != null ? Number(emp.distanceFromDepotKm).toFixed(1) : "—"}
     </td>
   </>
 )}
 <td className="px-5 py-3.5 font-medium text-[#4a4a4a]">
 {emp.manager?.name ?? <span className="text-[#9a9a9a] font-normal text-[11px]">None</span>}
 </td>
 <td className="px-5 py-3.5 text-right">
 <div className="flex items-center justify-end gap-1.5">
 {emp.designation === "Driver" ? (
   <Link
     href="/dashboard/admin/operations/cabs"
     className="text-xs text-[#ff4f00] hover:underline font-bold"
   >
     Manage Cab & Docs
   </Link>
 ) : (
   <>
     <button 
      onClick={() => {
      setEditingEmployee(emp);
      setShowModal(true);
      setFormError(null);
      setAutoAddress(null);
      }}
     className="p-1.5 text-[#9a9a9a] hover:text-[#1c1b1f] hover:bg-[#f7f7f7] rounded transition"
     >
     <Edit className="w-3.5 h-3.5" />
     </button>
     <button
     onClick={() => setEmpToDelete({ id: emp.id, name: emp.name })}
     className="p-1.5 text-[#9a9a9a] hover:text-[#1c1b1f] hover:bg-[#f7f7f7] rounded transition"
     >
     <Trash2 className="w-3.5 h-3.5" />
     </button>
   </>
 )}
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
 
 {/* Create Modal */}
 {showModal && (
 <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#1c1b1f]/60 backdrop-blur-md animate-fadeIn">
 <div className="bg-white/95 backdrop-blur-xl rounded-none border border-white/20 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
 <div className="flex items-center justify-between p-6 border-b border-slate-100/80 bg-white/50 sticky top-0 z-10">
 <h2 className="text-lg font-black text-[#1c1b1f] tracking-tight">
 {editingEmployee ? "Edit Employee" : "Add Employee"}
 </h2>
 <button 
 onClick={() => { setShowModal(false); setEditingEmployee(null); }} 
 className="p-2 rounded-none hover:bg-slate-200/50 text-[#6b6b6b] hover:text-[#1c1b1f] transition-all bg-[#f7f7f7]/50"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 <form ref={formRef} key={editingEmployee?.id || "new"} onSubmit={handleCreate} className="p-6 space-y-6 bg-white/40">
 {formError && (
 <div className="rounded-none border border-[#e8e8e8] bg-[#f7f7f7]/80 p-4 text-sm font-semibold text-[#1c1b1f] backdrop-blur-sm">
 {formError}
 </div>
 )}

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <Field label="Employee Code" name="employeeCode" required placeholder="EMP001" defaultValue={editingEmployee?.employeeCode} />
 <Field label="Full Name" name="name" required placeholder="John Doe" defaultValue={editingEmployee?.name} />
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <SelectField label="Gender" name="gender" required defaultValue={editingEmployee?.gender}>
 <option value="MALE">Male</option>
 <option value="FEMALE">Female</option>
 </SelectField>
 <SelectField label="Designation" name="designation" defaultValue={editingEmployee?.designation}>
 <option value="Engineer">Engineer</option>
 <option value="Lead">Lead</option>
 <option value="Manager">Manager</option>
 <option value="Senior Manager">Senior Manager</option>
 <option value="Intern">Intern</option>
 </SelectField>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <Field label="Email" name="email" type="email" placeholder="john@company.com" defaultValue={editingEmployee?.email} />
 <Field label="Phone" name="phone" placeholder="+91 98765 43210" defaultValue={editingEmployee?.phone} />
 </div>
 <Field label="Department" name="department" placeholder="Engineering" defaultValue={editingEmployee?.department} />
 
 <div>
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1.5">Address / Locality<span className="text-[#6b6b6b] ml-0.5">*</span></label>
  <LocationAutocomplete
  name="address"
  className="w-full border border-[#e8e8e8] rounded-none px-4 py-2.5 text-sm bg-[#f7f7f7]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-[#ff4f00] transition-all placeholder:text-[#9a9a9a] text-[#1c1b1f]"
  defaultValue={editingEmployee?.address}
  placeholder="e.g. Sadar, Nagpur"
  required={true}
  onSelect={(loc) => setAutoAddress(loc)}
  />
 </div>

 <SelectField label="Shift" name="shiftId" defaultValue={editingEmployee?.shiftId || ""}>
 <option value="">-- No shift --</option>
 {shifts.map((s) => (
 <option key={s.id} value={s.id}>{s.name}</option>
 ))}
 </SelectField>
 <SelectField label="Manager" name="managerId" defaultValue={editingEmployee?.managerId || ""}>
 <option value="">-- No manager --</option>
 {employees
 .filter((emp) => emp.id !== editingEmployee?.id && (emp.designation === "Manager" || emp.designation === "Senior Manager"))
 .map((emp) => (
 <option key={emp.id} value={emp.id}>{emp.name} ({emp.designation})</option>
 ))}
 </SelectField>

 <div className="flex justify-end gap-3 pt-6 border-t border-slate-100/80">
 <button 
 type="button" 
 onClick={() => { setShowModal(false); setEditingEmployee(null); }} 
 className="px-5 py-2.5 text-sm font-bold text-[#6b6b6b] hover:text-[#1c1b1f] border border-[#e8e8e8] rounded-none hover:bg-[#f7f7f7] transition-all shadow-none"
 >
 Cancel
 </button>
 <button type="submit" disabled={submitting} className="px-6 py-2.5 text-sm font-bold text-white bg-[#1c1b1f] hover:bg-black shadow-none shadow-slate-900/20 rounded-none transition-all disabled:opacity-50">
 {submitting ? (editingEmployee ? "Saving…" : "Creating…") : (editingEmployee ? "Save Changes" : "Create Employee")}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}

 <ConfirmModal
  isOpen={!!empToDelete}
  onClose={() => setEmpToDelete(null)}
  onConfirm={() => {
    if (empToDelete) handleDelete(empToDelete.id);
  }}
  title="Delete Employee"
  message={`Are you sure you want to permanently delete "${empToDelete?.name}"? This action cannot be undone.`}
  confirmText="Delete Employee"
  isDestructive={true}
 />
 </>
 );
}

function Field({ label, name, required, type = "text", placeholder, defaultValue }: { label: string; name: string; required?: boolean; type?: string; placeholder?: string; defaultValue?: string }) {
 return (
 <div>
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1.5">{label}{required && <span className="text-[#6b6b6b] ml-0.5">*</span>}</label>
 <input
 name={name}
 type={type}
 required={required}
 placeholder={placeholder}
 defaultValue={defaultValue}
 className="w-full border border-[#e8e8e8] rounded-none px-4 py-2.5 text-sm bg-[#f7f7f7]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-[#ff4f00] transition-all placeholder:text-[#9a9a9a] text-[#1c1b1f]"
 />
 </div>
 );
}

function SelectField({ label, name, required, children, defaultValue }: { label: string; name: string; required?: boolean; children: React.ReactNode; defaultValue?: string }) {
 return (
 <div>
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1.5">{label}{required && <span className="text-[#6b6b6b] ml-0.5">*</span>}</label>
 <select
 name={name}
 required={required}
 defaultValue={defaultValue}
 className="w-full border border-[#e8e8e8] rounded-none px-4 py-2.5 text-sm bg-[#f7f7f7]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-[#ff4f00] transition-all text-[#1c1b1f]"
 >
 {children}
 </select>
 </div>
 );
}
