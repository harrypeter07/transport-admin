"use client";

import { useState, useEffect } from "react";
import { User } from "lucide-react";

type AppUser = {
 id: string;
 name: string;
 email: string;
 role: string;
 isActive: boolean;
 requiresPasswordChange: boolean;
};

export default function UsersPage() {
 const [users, setUsers] = useState<AppUser[]>([]);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState("");
 const [roleFilter, setRoleFilter] = useState("");

 useEffect(() => {
 fetchUsers();
 }, [search, roleFilter]);

 async function fetchUsers() {
 setLoading(true);
 const params = new URLSearchParams();
 if (search) params.append("search", search);
 if (roleFilter) params.append("role", roleFilter);

 const res = await fetch(`/api/users?${params.toString()}`);
 if (res.ok) {
 const data = await res.json();
 setUsers(data);
 }
 setLoading(false);
 }

 async function handleAction(id: string, action: "ENABLE" | "DISABLE" | "RESET_PASSWORD") {
 if (action === "RESET_PASSWORD") {
 if (!confirm("Are you sure you want to reset this user's password to the default?")) return;
 }

 const res = await fetch("/api/users", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id, action }),
 });

 if (res.ok) {
 alert("Action successful");
 fetchUsers();
 } else {
 alert("Action failed");
 }
 }

 return (
 <div className="space-y-6">
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold text-[#1c1b1f]">User Management</h1>
 <p className="text-sm text-[#6b6b6b] mt-1">
 Provisioned accounts for the ETMS platform.
 </p>
 </div>
 </div>

 <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
 <div className="p-4 border-b border-[#e8e8e8] bg-[#f7f7f7] flex items-center justify-between gap-4">
 <input
 type="text"
 placeholder="Search users by name or email..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="w-full max-w-sm rounded-none border border-[#e8e8e8] bg-white px-3.5 py-2 text-sm text-[#1c1b1f] placeholder:text-[#9a9a9a] focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-[#ff4f00]"
 />
 <select
 value={roleFilter}
 onChange={(e) => setRoleFilter(e.target.value)}
 className="rounded-none border border-[#e8e8e8] bg-white px-3.5 py-2 text-sm text-[#1c1b1f] focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20"
 >
 <option value="">All Roles</option>
 <option value="ADMIN">Admin</option>
 <option value="MANAGER">Manager</option>
 <option value="EMPLOYEE">Employee</option>
 <option value="DRIVER">Driver</option>
 </select>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left text-sm text-[#6b6b6b]">
 <thead className="bg-[#f7f7f7] text-xs uppercase text-[#6b6b6b] border-b border-[#e8e8e8]">
 <tr>
 <th className="px-6 py-4 font-bold">User</th>
 <th className="px-6 py-4 font-bold">Role</th>
 <th className="px-6 py-4 font-bold">Status</th>
 <th className="px-6 py-4 font-bold">Security</th>
 <th className="px-6 py-4 font-bold text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {loading ? (
 <tr>
 <td colSpan={5} className="px-6 py-8 text-center text-[#9a9a9a]">
 Loading users...
 </td>
 </tr>
 ) : users.length === 0 ? (
 <tr>
 <td colSpan={5} className="px-6 py-8 text-center text-[#9a9a9a]">
 No users found
 </td>
 </tr>
 ) : (
 users.map((user) => (
 <tr key={user.id} className="hover:bg-[#f7f7f7]/50 transition-colors">
 <td className="px-6 py-4">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-none bg-[#f7f7f7] flex items-center justify-center text-[#6b6b6b]">
 <User size={14} />
 </div>
 <div>
 <p className="font-bold text-[#1c1b1f]">{user.name}</p>
 <p className="text-xs text-[#6b6b6b]">{user.email}</p>
 </div>
 </div>
 </td>
 <td className="px-6 py-4">
 <span className="inline-flex items-center px-2.5 py-0.5 rounded-none text-xs font-bold bg-[#f7f7f7] text-[#4a4a4a]">
 {user.role}
 </span>
 </td>
 <td className="px-6 py-4">
 <span
 className={`inline-flex items-center px-2.5 py-0.5 rounded-none text-xs font-bold ${
 user.isActive
 ? "bg-[#f7f7f7] text-[#1c1b1f]"
 : "bg-[#f7f7f7] text-[#1c1b1f]"
 }`}
 >
 {user.isActive ? "Active" : "Disabled"}
 </span>
 </td>
 <td className="px-6 py-4">
 {user.requiresPasswordChange ? (
 <span className="text-[#1c1b1f] text-xs font-semibold flex items-center gap-1">
 Pending Setup
 </span>
 ) : (
 <span className="text-[#1c1b1f] text-xs font-semibold">
 Secure
 </span>
 )}
 </td>
 <td className="px-6 py-4 text-right">
 <div className="flex items-center justify-end gap-2">
 <button
 onClick={() => handleAction(user.id, "RESET_PASSWORD")}
 className="px-3 py-1.5 text-xs font-bold text-[#6b6b6b] hover:text-[#1c1b1f] hover:bg-[#f7f7f7] rounded-none transition-colors"
 >
 Reset Pass
 </button>
 {user.isActive ? (
 <button
 onClick={() => handleAction(user.id, "DISABLE")}
 className="px-3 py-1.5 text-xs font-bold text-[#1c1b1f] hover:bg-[#f7f7f7] rounded-none transition-colors"
 >
 Disable
 </button>
 ) : (
 <button
 onClick={() => handleAction(user.id, "ENABLE")}
 className="px-3 py-1.5 text-xs font-bold text-[#1c1b1f] hover:bg-[#f7f7f7] rounded-none transition-colors"
 >
 Enable
 </button>
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
 );
}
