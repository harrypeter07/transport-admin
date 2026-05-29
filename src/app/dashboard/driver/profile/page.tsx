import NotificationPreferences from "@/components/NotificationPreferences";

export default function DriverProfilePage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your personal details and security.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
            Personal Information
          </h2>
          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phone Number</label>
                <input type="tel" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900" placeholder="+91 00000 00000" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">License Number</label>
                <input type="text" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900" placeholder="XX-00-00000" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Residential Address</label>
              <textarea className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900" rows={3}></textarea>
            </div>
            <button type="button" className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition-colors">
              Save Changes
            </button>
          </form>
        </div>
        
        <div className="p-6 bg-slate-50">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
            Security & Account
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">Change Password</p>
              <p className="text-xs text-slate-500 mt-0.5">Update your login credentials securely.</p>
            </div>
            <a href="/change-password" className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-100 transition-colors bg-white">
              Update Password
            </a>
          </div>
        </div>
      </div>
      
      <NotificationPreferences />
    </div>
  );
}
