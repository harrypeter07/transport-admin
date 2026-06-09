"use client";

import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, CheckCircle, XCircle, Clock, Plus, User as UserIcon } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import ConfirmModal from "@/components/ConfirmModal";

type LeaveRequest = {
 id: string;
 applicant: { id: string; name: string; email: string };
 approver?: { id: string; name: string };
 startDate: string;
 endDate: string;
 status: string;
 comments?: string;
};

type AppUser = {
 id: string;
 name: string;
 email: string;
 role: string;
};

export default function LeaveManagementPage() {
 const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
 const [users, setUsers] = useState<AppUser[]>([]);
 const [loading, setLoading] = useState(true);
 const [statusFilter, setStatusFilter] = useState("ALL");
 
 // Form State
 const [showForm, setShowForm] = useState(false);
 const [form, setForm] = useState({ applicantId: "", startDate: "", endDate: "", comments: "" });
 const [submitting, setSubmitting] = useState(false);
 const [error, setError] = useState("");
 
 const [leaveActionInfo, setLeaveActionInfo] = useState<{ id: string; action: "APPROVE" | "REJECT" } | null>(null);

 useEffect(() => {
 fetchLeaves();
 fetchUsers();
 }, [statusFilter]);

 async function fetchLeaves() {
 setLoading(true);
 try {
 const res = await fetch(`/api/leaves?status=${statusFilter}`);
 if (res.ok) {
 const data = await res.json();
 setLeaves(data);
 }
 } catch (e) {
 console.error(e);
 }
 setLoading(false);
 }

 async function fetchUsers() {
 try {
 const res = await fetch("/api/users");
 if (res.ok) {
 const data = await res.json();
 setUsers(data.filter((u: AppUser) => u.role !== "ADMIN"));
 }
 } catch (e) {
 console.error(e);
 }
 }

 async function handleAction(id: string, action: "APPROVE" | "REJECT") {
 try {
 const res = await fetch("/api/leaves", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id, action }),
 });

 if (res.ok) {
 fetchLeaves();
 } else {
 alert("Action failed");
 }
 } catch (e) {
 console.error(e);
 }
 }

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!form.applicantId || !form.startDate || !form.endDate) return;

 setSubmitting(true);
 setError("");

 try {
 const res = await fetch("/api/leaves", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ ...form, status: "APPROVED" }), // Admin-added leaves are auto-approved
 });

 if (res.ok) {
 setForm({ applicantId: "", startDate: "", endDate: "", comments: "" });
 setShowForm(false);
 fetchLeaves();
 } else {
 const data = await res.json();
 setError(data.error || "Failed to add leave");
 }
 } catch (e: any) {
 setError(e.message);
 }
 setSubmitting(false);
 }

 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h1 className="text-2xl font-bold text-[#1c1b1f]">Leaves & Approvals</h1>
 <p className="text-sm text-[#6b6b6b] mt-1">
 Manage employee absence and time-off requests.
 </p>
 </div>
 <button 
 onClick={() => setShowForm(!showForm)}
 className="flex items-center gap-2 px-4 py-2 bg-[#1c1b1f] text-white rounded-none text-sm font-bold hover:bg-black transition shadow-none"
 >
 <Plus size={16} />
 Log Manual Leave
 </button>
 </div>

 {showForm && (
 <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-none mb-6 animate-fadeIn">
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">
 Log Manual Leave
 </h2>
 <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
 {error && <div className="col-span-full text-[#1c1b1f] text-xs font-bold">{error}</div>}
 
 <div className="lg:col-span-1">
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1">Employee *</label>
 <select 
 required
 value={form.applicantId}
 onChange={(e) => setForm({...form, applicantId: e.target.value})}
 className="w-full bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
 >
 <option value="">Select Employee...</option>
 {users.map(u => (
 <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
 ))}
 </select>
 </div>
 
 <div className="lg:col-span-1">
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1">Start Date *</label>
 <input 
 type="date" 
 required
 value={form.startDate}
 onChange={(e) => setForm({...form, startDate: e.target.value})}
 className="w-full bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
 />
 </div>

 <div className="lg:col-span-1">
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1">End Date *</label>
 <input 
 type="date" 
 required
 value={form.endDate}
 onChange={(e) => setForm({...form, endDate: e.target.value})}
 className="w-full bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
 />
 </div>

 <div className="lg:col-span-1">
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1">Reason (Optional)</label>
 <input 
 type="text" 
 value={form.comments}
 onChange={(e) => setForm({...form, comments: e.target.value})}
 placeholder="e.g. Sick Leave"
 className="w-full bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
 />
 </div>

 <div className="lg:col-span-1">
 <button 
 type="submit" 
 disabled={submitting}
 className="w-full bg-[#1c1b1f] hover:bg-black shadow-none shadow-slate-900/20 text-white font-bold text-sm py-2 px-4 rounded-none transition disabled:opacity-50"
 >
 {submitting ? "Saving..." : "Log Leave (Auto-Approve)"}
 </button>
 </div>
 </form>
 </div>
 )}

 <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
 <div className="p-4 border-b border-[#e8e8e8] bg-[#f7f7f7] flex items-center justify-between gap-4">
 <select
 value={statusFilter}
 onChange={(e) => setStatusFilter(e.target.value)}
 className="rounded-none border border-[#e8e8e8] bg-white px-3.5 py-2 text-sm text-[#1c1b1f] focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20"
 >
 <option value="ALL">All Leaves</option>
 <option value="PENDING">Pending Approvals</option>
 <option value="APPROVED">Approved</option>
 <option value="REJECTED">Rejected</option>
 </select>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left text-sm text-[#6b6b6b]">
 <thead className="bg-[#f7f7f7] text-xs uppercase text-[#6b6b6b] border-b border-[#e8e8e8]">
 <tr>
 <th className="px-6 py-4 font-bold">Applicant</th>
 <th className="px-6 py-4 font-bold">Duration</th>
 <th className="px-6 py-4 font-bold">Status</th>
 <th className="px-6 py-4 font-bold">Notes</th>
 <th className="px-6 py-4 font-bold text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {loading ? (
 <tr>
 <td colSpan={5} className="px-6 py-8 text-center text-[#9a9a9a] font-medium">
 Loading leave requests...
 </td>
 </tr>
 ) : leaves.length === 0 ? (
 <tr>
 <td colSpan={5} className="px-6 py-8 text-center text-[#9a9a9a] font-medium">
 No leave requests found matching the current filter.
 </td>
 </tr>
 ) : (
 leaves.map((leave) => (
 <tr key={leave.id} className="hover:bg-[#f7f7f7]/50 transition-colors">
 <td className="px-6 py-4">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-none bg-[#f7f7f7] flex items-center justify-center text-[#6b6b6b]">
 <UserIcon size={14} />
 </div>
 <div>
 <p className="font-bold text-[#1c1b1f]">{leave.applicant?.name || "Unknown"}</p>
 <p className="text-xs text-[#6b6b6b]">{leave.applicant?.email || "N/A"}</p>
 </div>
 </div>
 </td>
 <td className="px-6 py-4">
 <div className="flex flex-col gap-1">
  <span className="text-[#1c1b1f] font-bold font-mono">{formatDate(leave.startDate)}</span>
  <span className="text-xs text-[#9a9a9a]">to <span className="text-[#6b6b6b] font-mono">{formatDate(leave.endDate)}</span></span>
 </div>
 </td>
 <td className="px-6 py-4">
 {leave.status === "APPROVED" && (
 <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-bold bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8]">
 <CheckCircle size={12} /> Approved
 </span>
 )}
 {leave.status === "REJECTED" && (
 <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-bold bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8]">
 <XCircle size={12} /> Rejected
 </span>
 )}
 {leave.status === "PENDING" && (
 <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-bold bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8]">
 <Clock size={12} /> Pending
 </span>
 )}
 </td>
 <td className="px-6 py-4 text-xs">
 <p className="text-[#4a4a4a]">{leave.comments || "-"}</p>
 {leave.approver && (
 <p className="text-[10px] text-[#9a9a9a] mt-1 uppercase tracking-wider font-bold">
 By: {leave.approver.name}
 </p>
 )}
 </td>
 <td className="px-6 py-4 text-right">
 {leave.status === "PENDING" ? (
 <div className="flex items-center justify-end gap-2">
 <button
 onClick={() => setLeaveActionInfo({ id: leave.id, action: "REJECT" })}
 className="px-3 py-1.5 text-xs font-bold text-[#1c1b1f] hover:bg-[#f7f7f7] rounded-none transition-colors border border-transparent hover:border-[#e8e8e8]"
 >
 Reject
 </button>
 <button
 onClick={() => setLeaveActionInfo({ id: leave.id, action: "APPROVE" })}
 className="px-3 py-1.5 text-xs font-bold text-[#1c1b1f] bg-[#f7f7f7] hover:bg-[#f7f7f7] rounded-none transition-colors border border-[#e8e8e8]"
 >
 Approve
 </button>
 </div>
 ) : (
 <span className="text-xs font-bold text-[#9a9a9a] uppercase tracking-widest mr-2">Actioned</span>
 )}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>

 <ConfirmModal
    isOpen={!!leaveActionInfo}
    onClose={() => setLeaveActionInfo(null)}
    onConfirm={() => {
      if (leaveActionInfo) handleAction(leaveActionInfo.id, leaveActionInfo.action);
    }}
    title={`${leaveActionInfo?.action === "APPROVE" ? "Approve" : "Reject"} Leave Request`}
    message={`Are you sure you want to ${leaveActionInfo?.action.toLowerCase()} this leave request?`}
    confirmText={leaveActionInfo?.action === "APPROVE" ? "Approve" : "Reject"}
    isDestructive={leaveActionInfo?.action === "REJECT"}
  />
 </div>
 );
}
