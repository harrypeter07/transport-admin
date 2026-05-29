"use client";

import { useEffect, useState } from "react";
import { Calendar as CalendarIcon, CheckCircle, AlertTriangle } from "lucide-react";

export default function CalendarWidget() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/calendar")
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => setLoading(false));
  }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col h-full">
      <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
        <CalendarIcon size={16} /> Schedule & Leaves
      </h2>
      
      {loading ? (
        <div className="flex-grow flex items-center justify-center py-10">
          <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin"></div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h3 className="text-xs font-bold text-slate-900 mb-2">Upcoming Holidays</h3>
            {data?.holidays?.length > 0 ? (
              <ul className="space-y-2">
                {data.holidays.map((h: any) => (
                  <li key={h.id} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{h.name}</span>
                    <span className="text-slate-500 font-mono">{h.date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 italic">No upcoming holidays</p>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h3 className="text-xs font-bold text-slate-900 mb-2">Approved Leaves</h3>
            {data?.leaves?.length > 0 ? (
              <ul className="space-y-2">
                {data.leaves.map((l: any) => (
                  <li key={l.id} className="flex flex-col text-xs border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-700">{l.applicant?.name || "You"}</span>
                      <span className="text-slate-500 font-mono">{l.startDate} to {l.endDate}</span>
                    </div>
                    {l.description && <span className="text-slate-500 truncate mt-0.5">"{l.description}"</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 italic">No approved leaves</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
