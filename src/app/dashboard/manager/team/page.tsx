export default function ManagerTeamPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Team</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your team members and view their schedules.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
          Team Roster
        </h2>
        <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-lg border border-slate-100 border-dashed">
          <span className="text-slate-400 mb-2">No team members assigned</span>
          <p className="text-sm text-slate-500">Employees reporting to you will appear here.</p>
        </div>
      </div>
    </div>
  );
}
