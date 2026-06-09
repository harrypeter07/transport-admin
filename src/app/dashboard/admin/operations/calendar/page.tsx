"use client";

import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, Trash2, Plus, ChevronLeft, ChevronRight, Edit2 } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";

export default function AdminHolidayManagement() {
 const [holidays, setHolidays] = useState<any[]>([]);
 const [loading, setLoading] = useState(true);
 
 // Calendar Navigation State
 const [currentMonth, setCurrentMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
 
 // Form State
 const [form, setForm] = useState({ id: "", date: "", name: "", description: "" });
 const [submitting, setSubmitting] = useState(false);
 const [error, setError] = useState("");
 const [isEditMode, setIsEditMode] = useState(false);

 useEffect(() => {
 fetchHolidays();
 }, []);

 async function fetchHolidays() {
 setLoading(true);
 try {
 const res = await fetch("/api/calendar/holidays");
 if (res.ok) {
 const data = await res.json();
 setHolidays(data);
 }
  } catch (e) {
  setError("Failed to load holidays");
  console.error(e);
  }
  setLoading(false);
  }

 // --- Calendar Logic ---
 const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
 const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

 const year = currentMonth.getFullYear();
 const month = currentMonth.getMonth();
 
 const daysInMonth = getDaysInMonth(year, month);
 const firstDay = getFirstDayOfMonth(year, month);
 
 const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

 const prevMonth = () => {
 setCurrentMonth(new Date(year, month - 1, 1));
 };

 const nextMonth = () => {
 setCurrentMonth(new Date(year, month + 1, 1));
 };

 const handleDateClick = (dayNumber: number) => {
 // Format YYYY-MM-DD
 const clickedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
 
 // Check if holiday exists on this date
 const existingHoliday = holidays.find(h => h.date === clickedDate);
 
 if (existingHoliday) {
 setIsEditMode(true);
 setForm({
 id: existingHoliday.id,
 date: existingHoliday.date,
 name: existingHoliday.name,
 description: existingHoliday.description || ""
 });
 } else {
 setIsEditMode(false);
 setForm({ id: "", date: clickedDate, name: "", description: "" });
 }
 setError("");
 };

 // --- Form Logic ---
 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!form.date || !form.name) return;
 
 setSubmitting(true);
 setError("");
 
 try {
 const method = isEditMode ? "PATCH" : "POST";
 const res = await fetch("/api/calendar/holidays", {
 method,
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(form)
 });
 
 if (res.ok) {
 setForm({ id: "", date: "", name: "", description: "" });
 setIsEditMode(false);
 fetchHolidays();
 } else {
 const data = await res.json();
 setError(data.error || "Failed to save holiday");
 }
 } catch (e: any) {
 setError(e.message);
 }
 setSubmitting(false);
 }

 const [holidayToDelete, setHolidayToDelete] = useState<string | null>(null);

 async function handleDelete(id: string) {
 try {
 const res = await fetch(`/api/calendar/holidays?id=${id}`, { method: "DELETE" });
 if (res.ok) {
 if (form.id === id) {
 setForm({ id: "", date: "", name: "", description: "" });
 setIsEditMode(false);
 }
 fetchHolidays();
 }
  } catch (e) {
  setError("Failed to delete holiday");
  console.error(e);
  }
 }

 // --- Rendering Calendar Grid ---
 const daysArray = [];
 // Empty slots for days before the 1st of the month
 for (let i = 0; i < firstDay; i++) {
 daysArray.push(<div key={`empty-${i}`} className="h-24 bg-[#f7f7f7] border border-slate-100/50 rounded-none opacity-50"></div>);
 }
 
 // Actual days
 for (let day = 1; day <= daysInMonth; day++) {
 const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
 const holiday = holidays.find(h => h.date === dateStr);
 const isSelected = form.date === dateStr;

 daysArray.push(
 <div 
 key={`day-${day}`}
 onClick={() => handleDateClick(day)}
 className={`h-24 p-2 rounded-none border transition-all cursor-pointer flex flex-col gap-1
 ${isSelected ? 'border-[#1c1b1f] bg-[#f7f7f7] shadow-inner' : 'border-[#e8e8e8] bg-white hover:border-slate-400 hover:shadow-xs'}
 `}
 >
 <span className={`text-xs font-bold ${holiday ? 'text-[#1c1b1f]' : 'text-[#6b6b6b]'}`}>{day}</span>
 {holiday && (
 <div className="bg-[#f7f7f7] text-[#1c1b1f] text-[10px] font-bold px-1.5 py-1 rounded truncate shadow-xs">
 {holiday.name}
 </div>
 )}
 </div>
 );
 }

 return (
  <div className="space-y-6">
  {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">{error}</div>}
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
  <div>
  <h1 className="text-2xl font-bold text-[#1c1b1f]">Holiday Management</h1>
 <p className="text-sm text-[#6b6b6b] mt-1">
 Interactive calendar to manage company holidays. Click on any date to add or edit a holiday.
 </p>
 </div>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 
 {/* Calendar Grid View */}
 <div className="lg:col-span-2 space-y-4">
 <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs">
 {/* Header / Controls */}
 <div className="flex items-center justify-between mb-6">
 <h2 className="text-lg font-black text-[#1c1b1f] flex items-center gap-2">
 <CalendarIcon size={20} className="text-[#6b6b6b]" />
 {monthNames[month]} {year}
 </h2>
 <div className="flex gap-2">
 <button onClick={prevMonth} className="p-2 border border-[#e8e8e8] rounded-none hover:bg-[#f7f7f7] transition text-[#6b6b6b]">
 <ChevronLeft size={16} />
 </button>
 <button onClick={() => setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="px-3 py-2 text-xs font-bold border border-[#e8e8e8] rounded-none hover:bg-[#f7f7f7] transition text-[#6b6b6b]">
 Today
 </button>
 <button onClick={nextMonth} className="p-2 border border-[#e8e8e8] rounded-none hover:bg-[#f7f7f7] transition text-[#6b6b6b]">
 <ChevronRight size={16} />
 </button>
 </div>
 </div>

 {/* Days of Week Row */}
 <div className="grid grid-cols-7 gap-2 mb-2">
 {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
 <div key={d} className="text-center text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest">{d}</div>
 ))}
 </div>

 {/* Calendar Grid */}
 <div className="grid grid-cols-7 gap-2">
 {daysArray}
 </div>
 
 {loading && <div className="mt-4 text-center text-xs text-[#9a9a9a] font-bold animate-pulse">Syncing calendar data...</div>}
 </div>
 </div>

 {/* Dynamic Form Panel */}
 <div className="lg:col-span-1 space-y-6">
 <div className={`bg-white border rounded-none p-6 shadow-xs transition-colors duration-300 ${isEditMode ? 'border-[#e8e8e8] bg-[#f7f7f7]/30' : 'border-[#e8e8e8]'}`}>
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest mb-4 flex items-center gap-2">
 {isEditMode ? <Edit2 size={16} className="text-[#ff4f00]" /> : <Plus size={16} />} 
 {isEditMode ? "Edit Holiday" : "Add Holiday"}
 </h2>
 
 <form onSubmit={handleSubmit} className="space-y-4">
 {error && <div className="text-[#1c1b1f] text-xs font-bold">{error}</div>}
 
 <div>
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1">Date *</label>
 <input 
 type="date" 
 required
 value={form.date}
 onChange={e => setForm({...form, date: e.target.value})}
 className="w-full bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-3 py-2 text-sm focus:outline-none focus:border-slate-400 font-mono"
 />
 </div>
 
 <div>
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1">Name *</label>
 <input 
 type="text" 
 required
 placeholder="e.g. Diwali"
 value={form.name}
 onChange={e => setForm({...form, name: e.target.value})}
 className="w-full bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1">Description (Optional)</label>
 <input 
 type="text" 
 value={form.description}
 onChange={e => setForm({...form, description: e.target.value})}
 className="w-full bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
 />
 </div>
 
 <div className="flex gap-2 pt-2">
 <button 
 type="submit" 
 disabled={submitting}
 className={`flex-1 text-white font-bold text-sm py-2 rounded-none transition disabled:opacity-50 bg-[#1c1b1f] hover:bg-black shadow-none`}
 >
 {submitting ? "Saving..." : (isEditMode ? "Update Holiday" : "Save Holiday")}
 </button>
 
 {isEditMode && (
 <button 
 type="button" 
 onClick={() => setHolidayToDelete(form.id)}
 className="px-4 bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8] rounded-none hover:bg-[#f7f7f7] transition"
 >
 <Trash2 size={18} />
 </button>
 )}
 </div>
 </form>
 </div>
 </div>
 </div>
 </div>

 <ConfirmModal
  isOpen={!!holidayToDelete}
  onClose={() => setHolidayToDelete(null)}
  onConfirm={() => {
    if (holidayToDelete) handleDelete(holidayToDelete);
  }}
  title="Delete Holiday"
  message="Are you sure you want to permanently delete this holiday? This action cannot be undone."
  confirmText="Delete Holiday"
  isDestructive={true}
 />
 </div>
 );
}
