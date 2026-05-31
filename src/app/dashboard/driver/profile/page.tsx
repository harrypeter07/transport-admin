import NotificationPreferences from "@/components/NotificationPreferences";

export default function DriverProfilePage() {
 return (
 <div className="space-y-6 max-w-2xl">
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold text-[#1c1b1f]">My Profile</h1>
 <p className="text-sm text-[#6b6b6b] mt-1">
 Manage your personal details and security.
 </p>
 </div>
 </div>

 <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
 <div className="p-6 border-b border-[#e8e8e8]">
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest mb-4">
 Personal Information
 </h2>
 <form className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-xs font-bold text-[#6b6b6b] uppercase tracking-widest mb-1.5">Phone Number</label>
 <input type="tel" className="w-full rounded-none border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f]" placeholder="+91 00000 00000" />
 </div>
 <div>
 <label className="block text-xs font-bold text-[#6b6b6b] uppercase tracking-widest mb-1.5">License Number</label>
 <input type="text" className="w-full rounded-none border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f]" placeholder="XX-00-00000" />
 </div>
 </div>
 <div>
 <label className="block text-xs font-bold text-[#6b6b6b] uppercase tracking-widest mb-1.5">Residential Address</label>
 <textarea className="w-full rounded-none border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f]" rows={3}></textarea>
 </div>
 <button type="button" className="px-4 py-2 bg-[#1c1b1f] text-white text-sm font-bold rounded-none hover:bg-black transition-colors">
 Save Changes
 </button>
 </form>
 </div>
 
 <div className="p-6 bg-[#f7f7f7]">
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest mb-4">
 Security & Account
 </h2>
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm font-bold text-[#1c1b1f]">Change Password</p>
 <p className="text-xs text-[#6b6b6b] mt-0.5">Update your login credentials securely.</p>
 </div>
 <a href="/change-password" className="px-4 py-2 border border-[#d0d0d0] text-[#4a4a4a] text-sm font-bold rounded-none hover:bg-[#f7f7f7] transition-colors bg-white">
 Update Password
 </a>
 </div>
 </div>
 </div>
 
 <NotificationPreferences />
 </div>
 );
}
