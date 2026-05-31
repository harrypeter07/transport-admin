"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, Network } from "lucide-react";

export default function HierarchyPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/employees");
        if (res.ok) setEmployees(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const computeLevels = (empList: any[]) => {
    // 1. Build map for easy lookup
    const map = new Map<string, any>();
    empList.forEach((e) => map.set(e.id, { ...e, reports: 0 }));

    // 2. Count direct reports
    empList.forEach((e) => {
      if (e.managerId && map.has(e.managerId)) {
        map.get(e.managerId).reports += 1;
      }
    });

    // 3. Compute depth (level) recursively
    const getDepth = (empId: string, visited = new Set<string>()): number => {
      if (visited.has(empId)) return 1; // Prevent infinite loops in case of cyclical reporting
      visited.add(empId);
      const emp = map.get(empId);
      if (!emp || !emp.managerId || !map.has(emp.managerId)) return 1;
      return 1 + getDepth(emp.managerId, visited);
    };

    // 4. Group by level
    const levelMap = new Map<number, any[]>();
    empList.forEach((e) => {
      const depth = getDepth(e.id);
      if (!levelMap.has(depth)) levelMap.set(depth, []);
      
      const enrichedEmp = map.get(e.id);
      enrichedEmp.managerName = e.managerId ? map.get(e.managerId)?.name : null;
      levelMap.get(depth)!.push(enrichedEmp);
    });

    // Convert to sorted array of [level, employees]
    return Array.from(levelMap.entries()).sort((a, b) => a[0] - b[0]);
  };

  const levels = computeLevels(employees);

  return (
    <div className="space-y-6 animate-fadeIn max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/dashboard/admin" className="hover:text-slate-900 transition">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-900">Hierarchy</span>
      </nav>

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Organization Hierarchy</h1>
          <p className="text-slate-500 text-sm mt-0.5">Workforce distributed by management levels.</p>
        </div>
        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
          <Network className="w-6 h-6 text-indigo-600" />
        </div>
      </div>

      <div className="space-y-8">
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
            <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin-fast mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Mapping Organization...</p>
          </div>
        ) : levels.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs text-slate-500 text-sm font-medium">
            No employees in the system yet.
          </div>
        ) : (
          levels.map(([level, empList]) => (
            <div key={level} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white font-black text-sm">
                    L{level}
                  </span>
                  <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">Level {level} Employees</h2>
                </div>
                <span className="text-[10px] font-black text-slate-400 bg-slate-200/50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {empList.length} Headcount
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest font-black text-slate-400 bg-white">
                      <th className="px-6 py-4 font-medium">Employee Name</th>
                      <th className="px-6 py-4 font-medium">Designation</th>
                      <th className="px-6 py-4 font-medium">Department</th>
                      <th className="px-6 py-4 font-medium">Reports To</th>
                      <th className="px-6 py-4 font-medium">Direct Reports</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm bg-white">
                    {empList.map((emp: any) => (
                      <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 block">{emp.name}</span>
                          <span className="text-xs text-slate-400 font-mono mt-0.5 block">{emp.employeeCode}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wide">
                            {emp.designation || "Engineer"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{emp.department}</td>
                        <td className="px-6 py-4">
                          {emp.managerName ? (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600 font-medium">{emp.managerName}</span>
                              <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                L{level - 1}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-300 font-bold text-xs uppercase tracking-widest">Top Level</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {emp.reports > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {emp.reports} Report{emp.reports !== 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs font-medium">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
