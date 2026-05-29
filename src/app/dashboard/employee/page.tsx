import CalendarWidget from "@/components/CalendarWidget";

export default function EmployeeDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employee Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome to your self-service portal.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
              Today's Route Status
            </h2>
            <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-lg border border-slate-100 border-dashed">
              <span className="text-slate-400 mb-2">No active route for today</span>
              <p className="text-sm text-slate-500">Your assigned pickup and drop details will appear here once optimized.</p>
            </div>
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
              Quick Actions
            </h2>
            <div className="flex flex-col gap-2">
              <a href="/dashboard/employee/requests" className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 block text-center">
                Apply for Leave
              </a>
              <a href="/dashboard/employee/requests" className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 block text-center">
                Request Time Change
              </a>
            </div>
          </div>

          <div className="h-64">
            <CalendarWidget />
          </div>
        </div>
      </div>
    </div>
  );
}
