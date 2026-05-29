"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, UserCircle2 } from "lucide-react";

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

  const buildTree = (empList: any[]) => {
    const map = new Map<string, any>();
    const roots: any[] = [];
    empList.forEach((e) => map.set(e.id, { ...e, children: [] }));
    empList.forEach((e) => {
      if (e.managerId && map.has(e.managerId)) {
        map.get(e.managerId).children.push(map.get(e.id));
      } else {
        roots.push(map.get(e.id));
      }
    });
    return roots;
  };

  const hierarchy = buildTree(employees);

  const renderNode = (node: any, depth = 0) => (
    <div key={node.id}>
      <div
        className="flex items-center gap-3 py-2.5 px-3 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100"
        style={{ marginLeft: `${depth * 1.75}rem` }}
      >
        {depth > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
        <UserCircle2 className="w-7 h-7 text-slate-300 flex-shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{node.name}</span>
            {node.children.length > 0 && (
              <span className="text-[10px] font-black text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                {node.children.length} report{node.children.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {node.designation ?? "Engineer"} · {node.department}
          </div>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="border-l border-slate-100 ml-[1rem]">
          {node.children.map((child: any) => renderNode(child, depth + 1))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/dashboard/admin" className="hover:text-slate-900 transition">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-900">Hierarchy</span>
      </nav>

      {/* Page Header */}
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Organization Hierarchy</h1>
        <p className="text-slate-500 text-sm mt-0.5">View reporting structures and management chains.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading organization tree…</div>
        ) : hierarchy.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">No employees in the system yet.</div>
        ) : (
          <div className="space-y-1">
            {hierarchy.map((root) => renderNode(root))}
          </div>
        )}
      </div>
    </div>
  );
}
