"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle } from "lucide-react";

export default function ManagerApprovalsPage() {
 const [leaves, setLeaves] = useState<any[]>([]);
 const [timingChanges, setTimingChanges] = useState<any[]>([]);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 fetchApprovals();
 }, []);

 async function fetchApprovals() {
 setLoading(true);
 const res = await fetch("/api/approvals/manager");
 if (res.ok) {
 const data = await res.json();
 setLeaves(data.leaves || []);
 setTimingChanges(data.timingChanges || []);
 }
 setLoading(false);
 }

 async function handleAction(id: string, type: "LEAVE" | "TIMING", status: "APPROVED" | "REJECTED") {
 const res = await fetch("/api/approvals/manager", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id, type, status, comments: "Processed via dashboard" })
 });
 if (res.ok) {
 fetchApprovals(); // Refresh
 }
 }

 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h1 className="text-2xl font-bold text-[#1c1b1f]">Approvals</h1>
 <p className="text-sm text-[#6b6b6b] mt-1">
 Review and approve leave and timing change requests from your team.
 </p>
 </div>
 </div>

 {loading ? (
 <div className="flex justify-center p-10"><div className="w-8 h-8 rounded-full border-4 border-[#e8e8e8] border-t-[#1c1b1f] animate-spin-fast"></div></div>
 ) : (
 <div className="space-y-6">
 <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
 <div className="p-4 border-b border-[#e8e8e8] bg-[#f7f7f7]">
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest">
 Pending Leave Requests ({leaves.length})
 </h2>
 </div>
 <div className="p-0">
 {leaves.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-10 bg-white">
 <span className="text-[#9a9a9a] mb-2 font-medium">No pending leave requests</span>
 </div>
 ) : (
 <ul className="divide-y divide-slate-100">
 {leaves.map((l: any) => (
 <li key={l.id} className="p-4 flex items-center justify-between hover:bg-[#f7f7f7]">
 <div>
 <p className="font-bold text-[#1c1b1f]">{l.applicant?.name}</p>
 <p className="text-xs text-[#6b6b6b]">
 {l.startDate} to {l.endDate}
 </p>
 {l.description && <p className="text-xs text-[#9a9a9a] mt-1">"{l.description}"</p>}
 </div>
 <div className="flex gap-2">
 <button onClick={() => handleAction(l.id, "LEAVE", "APPROVED")} className="flex items-center gap-1 bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8] px-3 py-1.5 rounded text-xs font-bold hover:bg-[#f7f7f7] transition cursor-pointer">
 <CheckCircle size={14} /> Approve
 </button>
 <button onClick={() => handleAction(l.id, "LEAVE", "REJECTED")} className="flex items-center gap-1 bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8] px-3 py-1.5 rounded text-xs font-bold hover:bg-[#f7f7f7] transition cursor-pointer">
 <XCircle size={14} /> Reject
 </button>
 </div>
 </li>
 ))}
 </ul>
 )}
 </div>
 </div>

 <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
 <div className="p-4 border-b border-[#e8e8e8] bg-[#f7f7f7]">
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest">
 Pending Timing Changes ({timingChanges.length})
 </h2>
 </div>
 <div className="p-0">
 {timingChanges.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-10 bg-white">
 <span className="text-[#9a9a9a] mb-2 font-medium">No pending timing changes</span>
 </div>
 ) : (
 <ul className="divide-y divide-slate-100">
 {timingChanges.map((t: any) => (
 <li key={t.id} className="p-4 flex items-center justify-between hover:bg-[#f7f7f7]">
 <div>
 <p className="font-bold text-[#1c1b1f]">{t.employee?.name}</p>
 <p className="text-xs text-[#6b6b6b]">
 Change {t.requestType} to {t.requestedTime} (Currently: {t.currentTime})
 </p>
 </div>
 <div className="flex gap-2">
 <button onClick={() => handleAction(t.id, "TIMING", "APPROVED")} className="flex items-center gap-1 bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8] px-3 py-1.5 rounded text-xs font-bold hover:bg-[#f7f7f7] transition cursor-pointer">
 <CheckCircle size={14} /> Approve
 </button>
 <button onClick={() => handleAction(t.id, "TIMING", "REJECTED")} className="flex items-center gap-1 bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8] px-3 py-1.5 rounded text-xs font-bold hover:bg-[#f7f7f7] transition cursor-pointer">
 <XCircle size={14} /> Reject
 </button>
 </div>
 </li>
 ))}
 </ul>
 )}
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
