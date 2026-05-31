"use client";

import { useState, useEffect } from "react";
import { Users, Calendar, Mail, Phone, Clock, FileText, ChevronLeft, ChevronRight, UserCheck } from "lucide-react";

export default function ManagerTeamPage() {
 const [team, setTeam] = useState<any[]>([]);
 const [loading, setLoading] = useState(true);
 const [activeTab, setActiveTab] = useState<"ROSTER" | "CALENDAR">("ROSTER");

 // Roster Calendar States
 const [currentDate, setCurrentDate] = useState(new Date());
 
 useEffect(() => {
 fetchTeam();
 }, []);

 async function fetchTeam() {
 setLoading(true);
 try {
 const res = await fetch("/api/manager/team");
 if (res.ok) {
 const data = await res.json();
 setTeam(data.team || []);
 }
 } catch (e) {
 console.error("Error loading manager team:", e);
 } finally {
 setLoading(false);
 }
 }

 // Monthly Calendar logic
 const year = currentDate.getFullYear();
 const month = currentDate.getMonth();

 const firstDayOfMonth = new Date(year, month, 1).getDay();
 const daysInMonth = new Date(year, month + 1, 0).getDate();

 const months = [
 "January", "February", "March", "April", "May", "June",
 "July", "August", "September", "October", "November", "December"
 ];

 function handlePrevMonth() {
 setCurrentDate(new Date(year, month - 1, 1));
 }

 function handleNextMonth() {
 setCurrentDate(new Date(year, month + 1, 1));
 }

 // Get leaves scheduled on a specific date for any team member
 function getLeavesForDate(dateStr: string) {
 const activeLeaves: any[] = [];
 team.forEach(emp => {
 const leaves = emp.user?.leaves || [];
 leaves.forEach((l: any) => {
 if (l.status === "APPROVED" && l.startDate <= dateStr && l.endDate >= dateStr) {
 activeLeaves.push({ employeeName: emp.name, leave: l });
 }
 });
 });
 return activeLeaves;
 }

 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
 <div>
 <h1 className="text-2xl font-bold text-[#1c1b1f]">My Team</h1>
 <p className="text-sm text-[#6b6b6b] mt-1">
 Manage your reporting lines, view shifts, and monitor calendar schedules.
 </p>
 </div>
 
 <div className="inline-flex rounded-none border border-[#e8e8e8] p-0.5 bg-white">
 <button
 onClick={() => setActiveTab("ROSTER")}
 className={`px-4 py-2 text-xs font-bold rounded-none cursor-pointer transition ${
 activeTab === "ROSTER"
 ? "bg-black text-white shadow-xs"
 : "text-slate-655 hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
 }`}
 >
 Team Roster
 </button>
 <button
 onClick={() => setActiveTab("CALENDAR")}
 className={`px-4 py-2 text-xs font-bold rounded-none cursor-pointer transition ${
 activeTab === "CALENDAR"
 ? "bg-black text-white shadow-xs"
 : "text-slate-655 hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
 }`}
 >
 Coverage Calendar
 </button>
 </div>
 </div>

 {loading ? (
 <div className="flex justify-center p-20"><div className="w-8 h-8 rounded-none border-4 border-[#e8e8e8] border-t-slate-800 animate-spin-fast"></div></div>
 ) : team.length === 0 ? (
 <div className="bg-white border border-[#e8e8e8] rounded-none p-8 flex flex-col items-center justify-center text-center">
 <span className="text-[#9a9a9a] mb-2 font-bold uppercase tracking-widest text-xs">No Direct Reports</span>
 <p className="text-sm text-[#6b6b6b] max-w-xs">There are no employees reporting to your profile in the database.</p>
 </div>
 ) : activeTab === "ROSTER" ? (
 /* Team Roster Tab */
 <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
 <div className="p-4 border-b border-[#e8e8e8] bg-[#f7f7f7] flex justify-between items-center">
 <h2 className="text-xs font-black text-[#4a4a4a] uppercase tracking-widest">
 Team Roster ({team.length} Members)
 </h2>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs border-collapse">
 <thead>
 <tr className="border-b border-[#e8e8e8] bg-[#f7f7f7] font-bold text-[#6b6b6b] uppercase tracking-wider">
 <th className="p-3 pl-4">Name</th>
 <th className="p-3">Employee Code</th>
 <th className="p-3">Designation</th>
 <th className="p-3">Shift Schedule</th>
 <th className="p-3">Contact</th>
 <th className="p-3 pr-4">Status</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {team.map((emp) => (
 <tr key={emp.id} className="hover:bg-[#f7f7f7]">
 <td className="p-3 pl-4 font-bold text-[#1c1b1f]">
 {emp.name}
 <span className="text-[10px] text-[#9a9a9a] font-semibold block mt-0.5">{emp.department}</span>
 </td>
 <td className="p-3 font-mono text-[#6b6b6b]">{emp.employeeCode}</td>
 <td className="p-3 font-medium text-[#4a4a4a]">{emp.designation || "Engineer"}</td>
 <td className="p-3">
 {emp.shift ? (
 <span className="font-semibold text-[#4a4a4a] flex items-center gap-1">
 <Clock size={12} className="text-[#9a9a9a]" />
 {emp.shift.name} ({emp.shift.startTime} - {emp.shift.endTime})
 </span>
 ) : (
 <span className="text-[#9a9a9a] italic">No shift assigned</span>
 )}
 </td>
 <td className="p-3 space-y-1">
 <div className="flex items-center gap-1.5 text-[#6b6b6b]">
 <Mail size={12} /> {emp.email}
 </div>
 <div className="flex items-center gap-1.5 text-[#6b6b6b] font-semibold">
 <Phone size={12} /> {emp.phone}
 </div>
 </td>
 <td className="p-3 pr-4">
 <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
 emp.status === 'ACTIVE' ? 'bg-[#f7f7f7] text-[#1c1b1f]' : 'bg-[#f7f7f7] text-[#9a9a9a]'
 }`}>
 {emp.status}
 </span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 ) : (
 /* Team Calendar Coverage Tab */
 <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs p-6 space-y-6">
 <div className="flex items-center justify-between border-b border-slate-100 pb-3">
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest flex items-center gap-1.5">
 <Calendar size={15} className="text-[#6b6b6b]" /> Team Coverage Calendar
 </h2>
 
 <div className="flex items-center gap-3">
 <button onClick={handlePrevMonth} className="p-1.5 border border-[#e8e8e8] hover:bg-[#f7f7f7] rounded-none text-slate-655 cursor-pointer">
 <ChevronLeft size={16} />
 </button>
 <span className="text-sm font-black text-[#1c1b1f] uppercase tracking-wide min-w-[120px] text-center">
 {months[month]} {year}
 </span>
 <button onClick={handleNextMonth} className="p-1.5 border border-[#e8e8e8] hover:bg-[#f7f7f7] rounded-none text-slate-655 cursor-pointer">
 <ChevronRight size={16} />
 </button>
 </div>
 </div>

 <div className="grid grid-cols-7 gap-1 text-center font-bold text-[#9a9a9a] text-[10px] uppercase tracking-widest mb-1">
 <span>Sun</span>
 <span>Mon</span>
 <span>Tue</span>
 <span>Wed</span>
 <span>Thu</span>
 <span>Fri</span>
 <span>Sat</span>
 </div>

 <div className="grid grid-cols-7 gap-1.5 min-h-[300px]">
 {/* Blank offset days */}
 {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
 <div key={`offset-${idx}`} className="bg-[#f7f7f7]/50 rounded-none border border-slate-100 border-dashed" />
 ))}

 {/* Days in Month */}
 {Array.from({ length: daysInMonth }).map((_, idx) => {
 const day = idx + 1;
 const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
 const dayLeaves = getLeavesForDate(dateStr);
 const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();

 return (
 <div 
 key={day} 
 className={`border rounded-none p-2 flex flex-col text-left justify-between min-h-[70px] transition-colors ${
 isToday ? "border-slate-850 bg-[#f7f7f7] shadow-2xs" : "border-[#e8e8e8] hover:bg-[#f7f7f7]/50"
 }`}
 >
 <span className={`text-[10px] font-black tracking-wide ${isToday ? "text-[#1c1b1f]" : "text-slate-450"}`}>
 {day}
 </span>
 
 <div className="flex flex-col gap-1 mt-1">
 {dayLeaves.map((dl, lIdx) => (
 <span 
 key={lIdx} 
 className="bg-[#f7f7f7] border border-[#e8e8e8] text-[#1c1b1f] text-[9px] font-bold px-1.5 py-0.5 rounded truncate"
 title={`${dl.employeeName} on Leave`}
 >
 🌴 {dl.employeeName.split(" ")[0]}
 </span>
 ))}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </div>
 );
}
