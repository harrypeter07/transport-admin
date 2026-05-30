"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, AlertCircle, Trash2, CalendarRange, Clock3, MessageSquarePlus } from "lucide-react";

export default function EmployeeRequestsPage() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [timingChanges, setTimingChanges] = useState<any[]>([]);
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [activeForm, setActiveForm] = useState<"LEAVE" | "TIMING" | null>(null);
  
  // Leave Form
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  // Timing Form
  const [timingType, setTimingType] = useState<"PICKUP" | "DROP">("PICKUP");
  const [requestedTime, setRequestedTime] = useState("");
  const [timingReason, setTimingReason] = useState("");

  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/requests");
      if (res.ok) {
        const data = await res.json();
        setLeaves(data.leaves || []);
        setTimingChanges(data.timingChanges || []);
        setEmployee(data.employee || null);
      }
    } catch (e) {
      console.error("Failed to fetch requests", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleLeaveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leaveStart || !leaveEnd) {
      showMessage("Please specify start and end dates.", true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/employee/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "LEAVE",
          startDate: leaveStart,
          endDate: leaveEnd,
          comments: leaveReason
        })
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("Leave request submitted successfully!", false);
        setLeaveStart("");
        setLeaveEnd("");
        setLeaveReason("");
        setActiveForm(null);
        fetchRequests();
      } else {
        showMessage(data.error || "Failed to submit request.", true);
      }
    } catch (err) {
      showMessage("Connection error. Please try again.", true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTimingSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requestedTime) {
      showMessage("Please specify your requested time.", true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/employee/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TIMING",
          requestType: timingType,
          requestedTime,
          comments: timingReason
        })
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("Timing change request submitted successfully!", false);
        setRequestedTime("");
        setTimingReason("");
        setActiveForm(null);
        fetchRequests();
      } else {
        showMessage(data.error || "Failed to submit request.", true);
      }
    } catch (err) {
      showMessage("Connection error. Please try again.", true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelRequest(requestId: string, type: "LEAVE" | "TIMING") {
    if (!confirm("Are you sure you want to cancel this pending request?")) return;
    try {
      const res = await fetch("/api/employee/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, type })
      });
      if (res.ok) {
        showMessage("Request cancelled successfully.", false);
        fetchRequests();
      } else {
        const data = await res.json();
        showMessage(data.error || "Failed to cancel request.", true);
      }
    } catch (e) {
      showMessage("Connection error.", true);
    }
  }

  function showMessage(text: string, isError: boolean) {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 5000);
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Requests</h1>
          <p className="text-sm text-slate-500 mt-1">
            Apply for leaves and request changes to your transportation timings.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveForm(activeForm === "LEAVE" ? null : "LEAVE")}
            className={`px-4 py-2 border rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeForm === "LEAVE"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <CalendarRange size={14} />
            Apply Leave
          </button>
          <button
            onClick={() => setActiveForm(activeForm === "TIMING" ? null : "TIMING")}
            className={`px-4 py-2 border rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeForm === "TIMING"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Clock3 size={14} />
            Change Timing
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-fadeIn ${
          message.isError ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
        }`}>
          <AlertCircle size={16} />
          {message.text}
        </div>
      )}

      {/* Leave Application Form */}
      {activeForm === "LEAVE" && (
        <form onSubmit={handleLeaveSubmit} className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs animate-fadeIn space-y-4 max-w-xl">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
            <CalendarRange size={16} className="text-slate-500" /> Apply For Leave
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Start Date</label>
              <input
                type="date"
                required
                value={leaveStart}
                onChange={(e) => setLeaveStart(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg text-sm p-2 px-3 focus:outline-none focus:border-slate-350"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">End Date</label>
              <input
                type="date"
                required
                value={leaveEnd}
                onChange={(e) => setLeaveEnd(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg text-sm p-2 px-3 focus:outline-none focus:border-slate-350"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason / Comments</label>
            <textarea
              placeholder="Provide a brief explanation for your leave..."
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg text-sm p-2 px-3 h-20 focus:outline-none focus:border-slate-350"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Leave Request"}
            </button>
          </div>
        </form>
      )}

      {/* Timing Change Request Form */}
      {activeForm === "TIMING" && (
        <form onSubmit={handleTimingSubmit} className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs animate-fadeIn space-y-4 max-w-xl">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
            <Clock3 size={16} className="text-slate-500" /> Request Timing Change
          </h2>
          {employee?.shift && (
            <div className="bg-slate-50 border border-slate-150 rounded-lg p-3 text-xs text-slate-600">
              <span className="font-bold text-slate-700">Current Shift: </span>
              {employee.shift.name} ({employee.shift.startTime} - {employee.shift.endTime})
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Request Type</label>
              <select
                value={timingType}
                onChange={(e) => setTimingType(e.target.value as any)}
                className="w-full bg-white border border-slate-200 rounded-lg text-sm p-2 px-3 focus:outline-none focus:border-slate-350 cursor-pointer"
              >
                <option value="PICKUP">Pickup Timing</option>
                <option value="DROP">Drop Timing</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Requested Time (HH:MM)</label>
              <input
                type="text"
                required
                placeholder="e.g. 08:30"
                value={requestedTime}
                onChange={(e) => setRequestedTime(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg text-sm p-2 px-3 focus:outline-none focus:border-slate-350"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason / Comments</label>
            <textarea
              placeholder="Provide a reason for the timing change..."
              value={timingReason}
              onChange={(e) => setTimingReason(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg text-sm p-2 px-3 h-20 focus:outline-none focus:border-slate-350"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Timing Request"}
            </button>
          </div>
        </form>
      )}

      {/* Leave Requests Log */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-xs font-black text-slate-700 uppercase tracking-widest">
            My Leave Requests
          </h2>
        </div>
        <div>
          {loading ? (
            <div className="p-10 text-center text-slate-400">Loading leave requests...</div>
          ) : leaves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 bg-slate-50/50">
              <span className="font-semibold text-sm">No leave requests submitted</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-500 uppercase tracking-wider">
                    <th className="p-3 pl-4">Duration</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="p-3 pl-4 font-bold text-slate-850">
                        {l.startDate} to {l.endDate}
                      </td>
                      <td className="p-3 text-slate-500 max-w-xs truncate" title={l.comments}>
                        {l.comments || "—"}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          l.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                          l.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                          l.status === 'CANCELLED' ? 'bg-slate-100 text-slate-400' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="p-3 text-right pr-4">
                        {l.status === "PENDING" && (
                          <button
                            onClick={() => handleCancelRequest(l.id, "LEAVE")}
                            className="text-red-500 hover:text-red-700 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={12} /> Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Timing Changes Log */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-xs font-black text-slate-700 uppercase tracking-widest">
            My Timing Change Requests
          </h2>
        </div>
        <div>
          {loading ? (
            <div className="p-10 text-center text-slate-400">Loading timing requests...</div>
          ) : timingChanges.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 bg-slate-50/50">
              <span className="font-semibold text-sm">No timing requests submitted</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-500 uppercase tracking-wider">
                    <th className="p-3 pl-4">Change Type</th>
                    <th className="p-3">Current Time</th>
                    <th className="p-3">Requested Time</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {timingChanges.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="p-3 pl-4 font-bold text-slate-850">
                        {t.requestType}
                      </td>
                      <td className="p-3 text-slate-500 font-semibold">{t.currentTime}</td>
                      <td className="p-3 font-bold text-slate-900">{t.requestedTime}</td>
                      <td className="p-3 text-slate-500 max-w-xs truncate" title={t.comments}>
                        {t.comments || "—"}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          t.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                          t.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                          t.status === 'CANCELLED' ? 'bg-slate-100 text-slate-400' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="p-3 text-right pr-4">
                        {t.status === "PENDING" && (
                          <button
                            onClick={() => handleCancelRequest(t.id, "TIMING")}
                            className="text-red-500 hover:text-red-700 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={12} /> Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
