"use client";

import { useState, useEffect } from "react";
import { Bell, Check } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Extract role from pathname (e.g. /dashboard/admin -> admin)
  const role = pathname.split("/")[2] || "employee";

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // 30s poll
    return () => clearInterval(interval);
  }, []);

  async function fetchNotifications() {
    const res = await fetch("/api/notifications?unread=true");
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications || []);
    }
  }

  async function markAsRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "MARK_READ", id }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  async function markAllAsRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "MARK_ALL_READ" }),
    });
    setNotifications([]);
  }

  function handleNotificationClick(n: any) {
    if (!n.read) markAsRead(n.id);
    if (n.actionUrl) {
      router.push(n.actionUrl);
    }
    setShowDropdown(false);
  }

  const unreadCount = notifications.length;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden z-50">
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">
                You have no new notifications.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.slice(0, 5).map((n) => (
                  <li
                    key={n.id}
                    className="p-4 hover:bg-slate-50 cursor-pointer transition-colors relative group"
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {n.category}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="font-bold text-slate-900 text-sm">{n.title}</p>
                    <p className="text-slate-600 text-sm mt-0.5 line-clamp-2">{n.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
            <button
              onClick={() => {
                setShowDropdown(false);
                router.push(`/dashboard/${role}/notifications`);
              }}
              className="text-xs font-bold text-slate-700 hover:text-slate-900 uppercase tracking-widest"
            >
              View All History
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
