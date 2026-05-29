"use client";

import { useState, useEffect } from "react";
import { Check, CheckCircle2, BellRing, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const router = useRouter();

  useEffect(() => {
    fetchNotifications();
  }, [filter]);

  async function fetchNotifications() {
    setLoading(true);
    let url = "/api/notifications?";
    if (filter === "UNREAD") url += "unread=true";
    else if (filter !== "ALL") url += `category=${filter}`;
    
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications || []);
    }
    setLoading(false);
  }

  async function markAsRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "MARK_READ", id }),
    });
    fetchNotifications(); // Refresh list to reflect accurate state based on filter
  }

  async function markAllAsRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "MARK_ALL_READ" }),
    });
    fetchNotifications();
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notification Center</h1>
          <p className="text-sm text-slate-500 mt-1">
            View and manage your alerts.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2"
          >
            <CheckCircle2 size={16} /> Mark All Read
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2 overflow-x-auto">
          {["ALL", "UNREAD", "ROUTE", "LEAVE", "APPROVAL", "SYSTEM"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-colors ${
                filter === f
                  ? "bg-slate-900 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-10 text-center text-slate-400">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
                <BellRing size={24} />
              </div>
              <span className="text-slate-900 font-bold">No notifications found</span>
              <p className="text-sm text-slate-500 mt-1">You're all caught up!</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-6 transition-colors flex gap-4 ${n.read ? "bg-white" : "bg-blue-50/30"}`}
              >
                {!n.read && (
                  <div className="mt-1.5 flex-shrink-0">
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
                  </div>
                )}
                <div className={`flex-1 ${n.read ? "pl-6" : ""}`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {n.category}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h3 className={`text-base ${!n.read ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                    {n.title}
                  </h3>
                  <p className={`text-sm mt-1 ${!n.read ? "text-slate-700 font-medium" : "text-slate-500"}`}>
                    {n.message}
                  </p>
                  
                  <div className="mt-4 flex items-center gap-4">
                    {n.actionUrl && (
                      <button 
                        onClick={() => {
                          if (!n.read) markAsRead(n.id);
                          router.push(n.actionUrl);
                        }}
                        className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        View Details →
                      </button>
                    )}
                    {!n.read && (
                      <button 
                        onClick={() => markAsRead(n.id)}
                        className="text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1"
                      >
                        <Check size={14} /> Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
