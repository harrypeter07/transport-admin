"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Search, Plus, Edit, Trash2, ChevronRight, X } from "lucide-react";

type Shift = { id: string; name: string };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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
      department: data.get("department"),
      designation: data.get("designation"),
      shiftId: data.get("shiftId") || null,
    };
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setShowModal(false);
        formRef.current?.reset();
        fetchEmployees();
      } else {
        const err = await res.json();
        setFormError(err.error || "Failed to create employee.");
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete employee "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/employees?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchEmployees();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/dashboard/admin" className="hover:text-slate-900 transition">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-900">Employees</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Employees</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage workforce, designations, and reporting structure.</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setFormError(null); }}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-2 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Add Employee
        </button>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, ID, or department..."
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
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Designation</th>
                <th className="px-5 py-3">Shift</th>
                <th className="px-5 py-3">Manager</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-xs">Loading…</td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-xs">No employees found. Use the &ldquo;Add Employee&rdquo; button to create one.</td></tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{emp.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{emp.employeeCode} · {emp.gender}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div>{emp.email}</div>
                      <div className="text-slate-400 mt-0.5">{emp.phone}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wide">
                        {emp.designation || "Engineer"}
                      </span>
                      <div className="text-[11px] text-slate-400 mt-1">{emp.department}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      {emp.shift ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white border border-slate-800">
                          {emp.shift.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-700">
                      {emp.manager?.name ?? <span className="text-slate-400 font-normal text-[11px]">None</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id, emp.name)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-widest">Add Employee</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form ref={formRef} onSubmit={handleCreate} className="p-5 space-y-4">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Employee Code" name="employeeCode" required placeholder="EMP001" />
                <Field label="Full Name" name="name" required placeholder="John Doe" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Gender" name="gender" required>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </SelectField>
                <SelectField label="Designation" name="designation">
                  <option value="Engineer">Engineer</option>
                  <option value="Lead">Lead</option>
                  <option value="Manager">Manager</option>
                  <option value="Senior Manager">Senior Manager</option>
                  <option value="Intern">Intern</option>
                </SelectField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Email" name="email" type="email" placeholder="john@company.com" />
                <Field label="Phone" name="phone" placeholder="+91 98765 43210" />
              </div>
              <Field label="Department" name="department" placeholder="Engineering" />
              <Field label="Address / Locality" name="address" required placeholder="Sadar, Nagpur" />
              <SelectField label="Shift" name="shiftId">
                <option value="">-- No shift --</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </SelectField>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 mt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition disabled:opacity-50">
                  {submitting ? "Creating…" : "Create Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, name, required, type = "text", placeholder }: { label: string; name: string; required?: boolean; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
      />
    </div>
  );
}

function SelectField({ label, name, required, children }: { label: string; name: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <select
        name={name}
        required={required}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
      >
        {children}
      </select>
    </div>
  );
}
