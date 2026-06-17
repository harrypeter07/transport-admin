"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Truck, FileText, Calendar, ShieldAlert, Upload, Trash2, Clock } from "lucide-react";

type Shift = { id: string; name: string };
type DriverDocument = {
  id: string;
  type: string;
  fileUrl: string;
  expiryDate: string;
  auditDate: string;
};
type Cab = {
  id: string;
  vehicleNumber: string;
  capacity: number;
  vendor: string;
  status: string;
  driverName: string;
  driverPhone: string;
  licenseNumber: string;
  driverAddress: string | null;
  formattedAddress: string | null;
  shifts: Shift[];
  documents: DriverDocument[];
};

export default function CabDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [cab, setCab] = useState<Cab | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadingDocType, setUploadingDocType] = useState<string>("");
  const [expiryDateInput, setExpiryDateInput] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const fetchCabDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cabs/${id}`);
      if (res.ok) {
        setCab(await res.json());
      } else {
        setError("Failed to load cab details.");
      }
    } catch {
      setError("Network error loading cab details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchCabDetails();
    }
  }, [id]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadingDocType || !expiryDateInput || !selectedFile) {
      alert("Please select document type, file, and expiry date.");
      return;
    }

    setUploadProgress("Uploading...");
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("type", uploadingDocType);
    formData.append("expiryDate", expiryDateInput);
    formData.append("cabId", id);

    try {
      const res = await fetch("/api/driver/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setUploadProgress("Success!");
        setSelectedFile(null);
        setExpiryDateInput("");
        setUploadingDocType("");
        fetchCabDetails();
        setTimeout(() => setUploadProgress(null), 3000);
      } else {
        const err = await res.json();
        setUploadProgress(null);
        alert(err.error || "Failed to upload document");
      }
    } catch {
      setUploadProgress(null);
      alert("Error uploading document. Please try again.");
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm("Are you sure you want to remove this compliance document?")) return;

    try {
      const res = await fetch(`/api/driver/documents?id=${docId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchCabDetails();
      } else {
        alert("Failed to delete document");
      }
    } catch {
      alert("Network error deleting document");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-[#6b6b6b] text-xs font-bold animate-pulse">
        <Clock className="w-8 h-8 mb-2 animate-spin text-[#9a9a9a]" />
        Loading Cab Details...
      </div>
    );
  }

  if (error || !cab) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-[#ff4f00] mx-auto" />
        <h2 className="text-lg font-bold text-[#1c1b1f]">{error || "Cab not found."}</h2>
        <Link href="/dashboard/admin/operations/cabs" className="inline-block text-xs font-bold bg-[#1c1b1f] text-white px-4 py-2 hover:bg-black transition">
          Back to Cabs
        </Link>
      </div>
    );
  }

  const docTypes = [
    { key: "LICENSE", label: "Driver License" },
    { key: "INSURANCE", label: "Vehicle Insurance" },
    { key: "RC", label: "Registration Certificate (RC)" },
    { key: "POLICE_VERIFICATION", label: "Police Verification" },
  ];

  return (
    <div className="space-y-6 animate-fadeIn p-6 bg-white min-h-screen">
      {/* Navigation & Title */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="space-y-1 text-left">
          <Link href="/dashboard/admin/operations/cabs" className="inline-flex items-center gap-1 text-xs text-[#ff4f00] font-black hover:underline mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Cabs
          </Link>
          <h1 className="text-xl font-extrabold text-[#1c1b1f] tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#9a9a9a]" /> {cab.vehicleNumber}
          </h1>
          <p className="text-[#6b6b6b] text-xs">Driver Compliance Registry & Cab Profile</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Profile Details */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-[#e8e8e8] p-5 shadow-xs">
            <h2 className="text-xs font-black text-[#9a9a9a] uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Cab Information</h2>
            <div className="space-y-3.5 text-sm">
              <DetailRow label="Vehicle Number" val={cab.vehicleNumber} isMono={true} />
              <DetailRow label="Capacity" val={`${cab.capacity} seats`} />
              <DetailRow label="Vendor / Agency" val={cab.vendor} />
              <DetailRow label="Status" val={
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide border ${
                  cab.status === "ACTIVE" ? "bg-[#1c1b1f] text-white border-slate-900" :
                  cab.status === "MAINTENANCE" ? "bg-[#f7f7f7] text-[#1c1b1f] border-[#e8e8e8]" :
                  "bg-[#f7f7f7] text-[#6b6b6b] border-[#e8e8e8]"
                }`}>{cab.status}</span>
              } />
              <div>
                <span className="block text-[11px] font-bold text-[#9a9a9a] uppercase tracking-wide">Assigned Shifts</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {cab.shifts && cab.shifts.length > 0 ? (
                    cab.shifts.map(s => (
                      <span key={s.id} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#f7f7f7] text-[#4a4a4a] border border-[#e8e8e8]">
                        {s.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-[#9a9a9a] italic">No shifts assigned</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e8e8e8] p-5 shadow-xs">
            <h2 className="text-xs font-black text-[#9a9a9a] uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Driver Profile</h2>
            <div className="space-y-3.5 text-sm">
              <DetailRow label="Driver Name" val={cab.driverName || "N/A"} />
              <DetailRow label="Phone Number" val={cab.driverPhone || "N/A"} isMono={true} />
              <DetailRow label="License Number" val={cab.licenseNumber || "N/A"} isMono={true} />
              <DetailRow label="Home Location / Starting Address" val={cab.formattedAddress || cab.driverAddress || "N/A"} />
            </div>
          </div>
        </div>

        {/* Right column: Document Compliance */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#e8e8e8] p-5 shadow-xs">
            <h2 className="text-xs font-black text-[#9a9a9a] uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Driver Compliance Checklist</h2>
            
            <div className="space-y-5">
              {docTypes.map(dt => {
                const doc = cab.documents?.find(d => d.type === dt.key);
                let badge = <span className="text-[10px] font-bold text-amber-600 uppercase bg-amber-50 border border-amber-200 px-2 py-0.5">⚠️ NOT UPLOADED</span>;
                let warningMsg = "";
                let auditMsg = "";

                if (doc) {
                  const isExpired = new Date(doc.expiryDate) < new Date();
                  const warningDate = new Date(doc.expiryDate);
                  warningDate.setDate(warningDate.getDate() - 14); // 2 weeks reminder
                  const isExpiringSoon = !isExpired && new Date() >= warningDate;

                  if (isExpired) {
                    badge = <span className="text-[10px] font-black text-red-600 uppercase bg-red-50 border border-red-200 px-2 py-0.5">❌ EXPIRED</span>;
                    warningMsg = "Compliance Alert: Document has expired. Please renew immediately.";
                  } else if (isExpiringSoon) {
                    badge = <span className="text-[10px] font-bold text-amber-600 uppercase bg-amber-50 border border-amber-200 px-2 py-0.5">⚠️ EXPIRING SOON</span>;
                    const daysLeft = Math.ceil((new Date(doc.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                    warningMsg = `Renewal Warning: Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`;
                  } else {
                    badge = <span className="text-[10px] font-bold text-emerald-600 uppercase bg-emerald-50 border border-emerald-200 px-2 py-0.5">✅ COMPLIANT</span>;
                  }

                  auditMsg = `Next Compliance Audit: ${new Date(doc.auditDate).toLocaleDateString()} (3 months inspection checkpoint)`;
                }

                return (
                  <div key={dt.key} className="border border-[#e8e8e8] p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1.5 text-left flex-grow">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-[#1c1b1f] text-sm">{dt.label}</span>
                        {badge}
                      </div>
                      
                      {doc ? (
                        <div className="text-xs text-[#6b6b6b] space-y-1">
                          <div><span className="font-semibold text-[#1c1b1f]">Due Date / Expiry:</span> {new Date(doc.expiryDate).toLocaleDateString()}</div>
                          <div className="text-[10px] text-[#9a9a9a] font-mono">{auditMsg}</div>
                          {warningMsg && <div className={`text-[10px] font-semibold mt-1 ${doc && new Date(doc.expiryDate) < new Date() ? 'text-red-600' : 'text-amber-600'}`}>{warningMsg}</div>}
                        </div>
                      ) : (
                        <p className="text-xs text-[#9a9a9a] italic">No document uploaded. Please upload a file with its expiry date below.</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      {doc && (
                        <>
                          <a href={`/api/driver/documents/view?id=${doc.id}`} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 border border-[#e8e8e8] text-xs font-bold text-[#1c1b1f] hover:bg-[#f7f7f7] transition uppercase">
                            View File
                          </a>
                          <button onClick={() => handleDeleteDoc(doc.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Delete Document">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upload panel */}
          <div className="bg-white border border-[#e8e8e8] p-5 shadow-xs">
            <h2 className="text-xs font-black text-[#9a9a9a] uppercase tracking-widest border-b border-slate-100 pb-3 mb-4 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-[#9a9a9a]" /> Upload Compliance Document
            </h2>

            <form onSubmit={handleUpload} className="space-y-4 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#4a4a4a] mb-1.5">Document Type *</label>
                  <select
                    required
                    value={uploadingDocType}
                    onChange={e => setUploadingDocType(e.target.value)}
                    className="w-full border border-[#e8e8e8] rounded-none px-4 py-2.5 text-sm bg-[#f7f7f7]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-[#ff4f00] transition-all text-[#1c1b1f]"
                  >
                    <option value="">Select Document Type</option>
                    {docTypes.map(dt => <option key={dt.key} value={dt.key}>{dt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#4a4a4a] mb-1.5">Expiry Date (Due Date) *</label>
                  <input
                    type="date"
                    required
                    value={expiryDateInput}
                    onChange={e => setExpiryDateInput(e.target.value)}
                    className="w-full border border-[#e8e8e8] rounded-none px-4 py-2.5 text-sm bg-[#f7f7f7]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-[#ff4f00] transition-all text-[#1c1b1f]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4a4a4a] mb-1.5">Select File *</label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-[#e8e8e8] border-dashed rounded-none cursor-pointer bg-[#f7f7f7]/50 hover:bg-[#f7f7f7] transition-all">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <FileText className="w-6 h-6 text-[#9a9a9a] mb-1" />
                      <p className="text-xs text-[#6b6b6b] font-bold">
                        {selectedFile ? selectedFile.name : "Click to select a file (PDF, Image)"}
                      </p>
                    </div>
                    <input
                      type="file"
                      required
                      accept=".pdf,image/*"
                      onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                {uploadProgress && (
                  <span className={`text-xs font-bold ${uploadProgress.includes('Success') ? 'text-emerald-600' : 'text-[#ff4f00] animate-pulse'}`}>
                    {uploadProgress}
                  </span>
                )}
                <button
                  type="submit"
                  disabled={!!uploadProgress}
                  className="bg-[#1c1b1f] hover:bg-black text-white text-xs font-bold px-5 py-2.5 rounded-none ml-auto transition cursor-pointer"
                >
                  Upload & Register Document
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, val, isMono }: { label: string; val: React.ReactNode; isMono?: boolean }) {
  return (
    <div className="border-b border-slate-100 pb-2">
      <span className="block text-[11px] font-bold text-[#9a9a9a] uppercase tracking-wide">{label}</span>
      <span className={`block mt-0.5 text-[#1c1b1f] font-semibold ${isMono ? 'font-mono text-xs' : ''}`}>{val}</span>
    </div>
  );
}
