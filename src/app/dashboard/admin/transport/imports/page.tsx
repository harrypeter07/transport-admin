"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileSpreadsheet, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { useTransportStore } from "@/store/useTransportStore";

export default function ImportsPage() {
  const {
    importSheets,
    fetchImportSheets,
    importSheet,
    uploadRosterFile,
    loading: storeLoading,
  } = useTransportStore();

  const [selectedImportSheet, setSelectedImportSheet] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message: string }>({ type: "idle", message: "" });
  const [outliers, setOutliers] = useState<{ count: number; list: string[] } | null>(null);

  useEffect(() => {
    fetchImportSheets();
  }, []);


  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setStatus({ type: "loading", message: "Uploading Excel file..." });
    setOutliers(null);
    try {
      const res = await uploadRosterFile(uploadFile);
      if (res.success) {
        setStatus({ type: "success", message: res.message || "Master data imported successfully." });
        setUploadFile(null);
        if (res.outlierCount > 0) {
          setOutliers({ count: res.outlierCount, list: res.outlierList || [] });
        }
      } else {
        setStatus({ type: "error", message: res.error || "Failed to upload file." });
      }
    } catch (err: any) {
      setStatus({ type: "error", message: err.message || "An unexpected error occurred during file upload." });
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-4xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/dashboard/admin" className="hover:text-slate-900 transition">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/dashboard/admin/transport/optimization" className="hover:text-slate-900 transition">Transport</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-900">Imports</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Roster Imports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Upload employee rosters via Excel to onboard employees, cabs, and shifts.</p>
        </div>
      </div>

      {/* Status Alert */}
      {status.type !== "idle" && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          status.type === "loading" ? "bg-blue-50 border-blue-200 text-blue-800" :
          status.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          "bg-red-50 border-red-200 text-red-800"
        }`}>
          {status.type === "loading" && <div className="w-5 h-5 rounded-full border-2 border-blue-600/30 border-t-blue-600 animate-spin flex-shrink-0" />}
          {status.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />}
          {status.type === "error" && <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
          <div className="flex-1 text-sm font-medium">{status.message}</div>
        </div>
      )}

      {/* Outlier Warning Panel */}
      {outliers && outliers.count > 0 && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex items-start gap-3">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">
              {outliers.count} employee{outliers.count > 1 ? "s" : ""} skipped — address outside pickup radius
            </p>
            <p className="text-xs text-amber-700 mt-0.5 mb-2">
              These addresses could not be resolved within the configured maximum pickup radius and were excluded from import.
            </p>
            <ul className="text-xs text-amber-800 space-y-0.5 font-mono">
              {outliers.list.map((name, i) => (
                <li key={i} className="flex items-center gap-1">• {name}</li>
              ))}
            </ul>
            <p className="text-[10px] text-amber-600 mt-2 font-medium">
              Tip: Adjust the Max Pickup Radius in <a href="/dashboard/admin/settings" className="underline font-bold">Settings</a> if these employees should be included.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-xl">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Upload className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-widest">Upload Master Roster</h2>
              <p className="text-xs text-slate-500 mt-0.5">Upload a daily or monthly roster Excel (.xlsx) file</p>
            </div>
          </div>
          <div className="p-5">
            <form onSubmit={handleFileUpload} className="flex flex-col gap-4">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 bg-slate-50 rounded-xl hover:border-slate-400 hover:bg-slate-100 transition cursor-pointer relative group">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-slate-600 mb-2" />
                <span className="text-sm font-semibold text-slate-700">
                  {uploadFile ? uploadFile.name : "Click or drag to select Excel file"}
                </span>
                <span className="text-xs text-slate-400 mt-1">Supports .xlsx, .xls, .csv</span>
              </div>
              <button
                type="submit"
                disabled={status.type === "loading" || !uploadFile}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-slate-800 transition disabled:opacity-50"
              >
                {status.type === "loading" ? "Processing Data..." : "Upload & Process Data"}
              </button>
            </form>
          </div>
        </div>
      </div>
      
      {/* Informational Note */}
      <div className="bg-slate-900 text-slate-300 p-5 rounded-xl text-sm leading-relaxed">
        <h3 className="text-white font-bold mb-2 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          How Import works
        </h3>
        <p>
          Uploading the Excel roster automatically creates or updates the master list of Employees, Cabs, and Shifts. 
          It processes <strong>every sheet</strong> in the file automatically and removes duplicates, saving you time. 
          To actually schedule transport, head over to the <Link href="/dashboard/admin/transport/optimization" className="text-white underline hover:text-indigo-300 font-medium">Route Optimization</Link> page where you can select specific dates, respect employee leaves, and auto-generate routes!
        </p>
      </div>
    </div>
  );
}
