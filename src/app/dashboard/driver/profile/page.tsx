"use client";

import { useEffect, useState } from "react";
import NotificationPreferences from "@/components/NotificationPreferences";
import { 
  Upload, 
  Eye, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  FileImage, 
  Loader2,
  X
} from "lucide-react";

interface SessionUser {
  name: string;
  email: string;
  role: string;
}

interface DriverDocument {
  id: string;
  cabId: string;
  type: string;
  fileUrl: string;
  expiryDate: string;
  auditDate: string;
  createdAt: string;
  updatedAt: string;
}

const DOCUMENT_TYPES = [
  { key: "LICENSE", label: "Driving License" },
  { key: "INSURANCE", label: "Vehicle Insurance" },
  { key: "RC", label: "Registration Certificate (RC Book)" },
  { key: "POLICE_VERIFICATION", label: "Police Verification" },
];

export default function DriverProfilePage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [activeTab, setActiveTab] = useState<"INFO" | "DOCS">("INFO");
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Expiry states per document type (temp inputs)
  const [expiryInputs, setExpiryInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = () => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error && d.userId) {
          setSession(d as SessionUser);
          // Fetch driver profile data
          fetch("/api/driver/profile")
            .then((res) => res.json())
            .then((data) => {
              if (!data.error) {
                setProfile(data);
                setDocuments(data.documents || []);
                
                // Initialize expiry date inputs
                const inputs: Record<string, string> = {};
                (data.documents || []).forEach((doc: DriverDocument) => {
                  inputs[doc.type] = doc.expiryDate ? doc.expiryDate.split("T")[0] : "";
                });
                setExpiryInputs(inputs);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  };

  const handleExpiryChange = (type: string, dateStr: string) => {
    setExpiryInputs((prev) => ({ ...prev, [type]: dateStr }));
  };

  const handleSaveExpiryOnly = async (type: string) => {
    const expiryDate = expiryInputs[type];
    if (!expiryDate) return;

    try {
      const res = await fetch("/api/driver/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, expiryDate }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMsg({ type: "success", text: `Expiry date updated for ${type}` });
        fetchInitialData();
      } else {
        setFeedbackMsg({ type: "error", text: data.error || "Failed to update expiry date" });
      }
    } catch {
      setFeedbackMsg({ type: "error", text: "Network error occurred." });
    }
  };

  const handleFileUpload = async (type: string, file: File) => {
    const expiryDate = expiryInputs[type];
    if (!expiryDate) {
      alert("Please select an Expiry Date first before uploading the document.");
      return;
    }

    setUploadingDoc(type);
    setFeedbackMsg(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    formData.append("expiryDate", expiryDate);

    try {
      const res = await fetch("/api/driver/documents/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMsg({ type: "success", text: `Document uploaded successfully for ${type}` });
        fetchInitialData();
      } else {
        setFeedbackMsg({ type: "error", text: data.error || "Upload failed" });
      }
    } catch {
      setFeedbackMsg({ type: "error", text: "Network connection lost." });
    } finally {
      setUploadingDoc(null);
    }
  };

  const getDocStatus = (doc: DriverDocument | undefined) => {
    if (!doc || !doc.fileUrl) return { status: "MISSING", label: "Missing", color: "text-amber-600 bg-amber-50 border-amber-200" };
    
    const expiry = new Date(doc.expiryDate);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return { status: "EXPIRED", label: "Expired", color: "text-rose-600 bg-rose-50 border-rose-200" };
    }
    if (diffDays <= 14) {
      return { status: "WARNING", label: `Expiring in ${diffDays} day${diffDays !== 1 ? "s" : ""}`, color: "text-orange-600 bg-orange-50 border-orange-200" };
    }
    return { status: "VALID", label: "Valid", color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  };

  const handlePreview = (doc: DriverDocument) => {
    const isBase64 = doc.fileUrl.startsWith("data:");
    const isImg = isBase64
      ? doc.fileUrl.startsWith("data:image/")
      : ["png", "jpg", "jpeg", "webp"].includes(doc.fileUrl.split(".").pop()?.toLowerCase() || "");

    setPreviewUrl(`/api/driver/documents/view?id=${doc.id}`);
    setPreviewType(isImg ? "image" : "pdf");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1c1b1f]">My Profile</h1>
          <p className="text-sm text-[#6b6b6b] mt-1">
            Manage your personal credentials, contact info, and compliance documents.
          </p>
        </div>
      </div>

      {session && (
        <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[#1c1b1f] flex items-center justify-center text-white text-sm font-bold">
                {session.name?.charAt(0)?.toUpperCase() || "D"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#1c1b1f] truncate">{session.name}</p>
                <p className="text-xs text-[#6b6b6b] truncate">{session.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-[#f0f0f0] text-[#6b6b6b] px-2.5 py-1 rounded-none">
                {session.role}
              </span>
              {profile?.vehicleNumber && (
                <span className="text-[10px] font-mono font-bold bg-[#1c1b1f] text-white px-2.5 py-1 rounded-none">
                  Cab: {profile.vehicleNumber}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#e8e8e8]">
        <button
          onClick={() => setActiveTab("INFO")}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition-colors ${
            activeTab === "INFO"
              ? "border-[#ff4f00] text-[#1c1b1f]"
              : "border-transparent text-[#6b6b6b] hover:text-[#1c1b1f]"
          }`}
        >
          Personal & Account Info
        </button>
        <button
          onClick={() => setActiveTab("DOCS")}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition-colors flex items-center gap-2 ${
            activeTab === "DOCS"
              ? "border-[#ff4f00] text-[#1c1b1f]"
              : "border-transparent text-[#6b6b6b] hover:text-[#1c1b1f]"
          }`}
        >
          Compliance Documents
          {documents.some(d => {
            const stat = getDocStatus(d);
            return stat.status === "EXPIRED" || stat.status === "WARNING" || stat.status === "MISSING";
          }) && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          )}
        </button>
      </div>

      {feedbackMsg && (
        <div
          className={`p-4 text-xs font-semibold border rounded-none flex items-center gap-2 ${
            feedbackMsg.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {feedbackMsg.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{feedbackMsg.text}</span>
          <button className="ml-auto hover:text-black font-bold text-sm" onClick={() => setFeedbackMsg(null)}>
            &times;
          </button>
        </div>
      )}

      {activeTab === "INFO" && (
        <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
          <div className="p-6 border-b border-[#e8e8e8]">
            <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest mb-4">
              Personal Information
            </h2>
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#6b6b6b] uppercase tracking-widest mb-1.5">Phone Number</label>
                  <input type="tel" className="w-full rounded-none border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f]" value={profile?.driverPhone || ""} readOnly placeholder="+91 00000 00000" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6b6b6b] uppercase tracking-widest mb-1.5">License Number</label>
                  <input type="text" className="w-full rounded-none border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f]" value={profile?.licenseNumber || ""} readOnly placeholder="XX-00-00000" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6b6b6b] uppercase tracking-widest mb-1.5">Residential Address</label>
                <textarea className="w-full rounded-none border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f]" value={profile?.formattedAddress || profile?.driverAddress || ""} readOnly rows={3}></textarea>
              </div>
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
          <div className="p-6 border-t border-[#e8e8e8]">
            <NotificationPreferences />
          </div>
        </div>
      )}

      {activeTab === "DOCS" && (
        <div className="space-y-4">
          <div className="bg-[#f7f7f7] border border-[#e8e8e8] p-4 text-left">
            <h3 className="text-xs font-bold text-[#1c1b1f] uppercase tracking-widest flex items-center gap-1.5">
              <Info className="w-4 h-4 text-[#ff4f00]" />
              Driver Compliance Guidelines
            </h3>
            <p className="text-xs text-[#4a4a4a] leading-relaxed mt-2">
              All active drivers must maintain valid compliance documents. 
              Uploads are checked for expiration. A 2-week renew reminder will trigger automatically, 
              and documents undergo regular organization audit review every 3 months.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {DOCUMENT_TYPES.map((dt) => {
              const matchedDoc = documents.find((d) => d.type === dt.key);
              const statusInfo = getDocStatus(matchedDoc);
              const isUploading = uploadingDoc === dt.key;
              const expiryDate = expiryInputs[dt.key] || "";

              return (
                <div 
                  key={dt.key} 
                  className={`border bg-white p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 transition-all ${
                    statusInfo.status === "EXPIRED" 
                      ? "border-rose-300 bg-rose-50/20" 
                      : statusInfo.status === "WARNING" 
                      ? "border-orange-300 bg-orange-50/10" 
                      : "border-[#e8e8e8]"
                  }`}
                >
                  <div className="space-y-2 text-left flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm font-bold text-[#1c1b1f]">{dt.label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 border uppercase tracking-wider ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="text-xs text-[#6b6b6b] space-y-1">
                      {matchedDoc ? (
                        <>
                          <p>
                            <span className="font-semibold text-[#4a4a4a]">Expiry Date:</span>{" "}
                            {new Date(matchedDoc.expiryDate).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                          <p>
                            <span className="font-semibold text-[#4a4a4a]">Renew Reminder (2 weeks prior):</span>{" "}
                            {(() => {
                              const r = new Date(matchedDoc.expiryDate);
                              r.setDate(r.getDate() - 14);
                              return r.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                            })()}
                          </p>
                          <p>
                            <span className="font-semibold text-[#4a4a4a]">Next Audit Date (3 months cycle):</span>{" "}
                            {new Date(matchedDoc.auditDate).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </>
                      ) : (
                        <p className="text-amber-700 italic">No file uploaded yet. Please select an expiry date and upload a document.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                    {/* Expiry Date input */}
                    <div className="flex flex-col">
                      <label className="text-[9px] font-bold text-[#6b6b6b] uppercase tracking-wider mb-1">
                        Expiry Date
                      </label>
                      <div className="relative">
                        <input
                          type="date"
                          value={expiryDate}
                          onChange={(e) => handleExpiryChange(dt.key, e.target.value)}
                          className="rounded-none border border-[#e8e8e8] px-2.5 py-1.5 text-xs text-[#1c1b1f] focus:outline-none focus:border-[#ff4f00] bg-white w-full pr-7"
                        />
                        {matchedDoc && expiryDate && expiryDate !== matchedDoc.expiryDate.split("T")[0] && (
                          <button
                            type="button"
                            onClick={() => handleSaveExpiryOnly(dt.key)}
                            className="absolute right-1 top-1.5 text-[9px] font-bold bg-[#1c1b1f] hover:bg-black text-white px-1 py-0.5 rounded-none"
                          >
                            Save
                          </button>
                        )}
                      </div>
                    </div>

                    {/* File Upload Button */}
                    <div className="flex flex-col">
                      <label className="text-[9px] font-bold text-[#6b6b6b] uppercase tracking-wider mb-1 opacity-0">
                        Upload
                      </label>
                      <label className={`flex items-center justify-center gap-1.5 px-3.5 py-2 border border-dashed border-[#d0d0d0] text-xs font-bold cursor-pointer transition-colors bg-white hover:bg-[#f7f7f7] ${isUploading ? "pointer-events-none opacity-50" : ""}`}>
                        {isUploading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6b6b6b]" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 text-[#6b6b6b]" />
                            Upload File
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(dt.key, file);
                          }}
                        />
                      </label>
                    </div>

                    {/* Preview Button */}
                    {matchedDoc && matchedDoc.fileUrl && (
                      <div className="flex flex-col">
                        <label className="text-[9px] font-bold text-[#6b6b6b] uppercase tracking-wider mb-1 opacity-0">
                          Preview
                        </label>
                        <button
                          type="button"
                          onClick={() => handlePreview(matchedDoc)}
                          className="flex items-center justify-center gap-1.5 px-3.5 py-2 border border-[#1c1b1f] text-xs font-bold text-[#1c1b1f] bg-white hover:bg-[#1c1b1f]/5 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-[#e8e8e8] w-full max-w-3xl flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-[#e8e8e8]">
              <span className="text-xs font-bold uppercase tracking-widest text-[#6b6b6b]">Document Preview</span>
              <button
                onClick={() => {
                  setPreviewUrl(null);
                  setPreviewType(null);
                }}
                className="p-1 hover:bg-[#f7f7f7] rounded-none cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto max-h-[70vh] flex items-center justify-center bg-[#f7f7f7]">
              {previewType === "image" ? (
                <img src={previewUrl} alt="Document preview" className="max-w-full max-h-[60vh] object-contain border border-[#e8e8e8] shadow-xs" />
              ) : (
                <div className="w-full text-center py-10 space-y-4">
                  <FileText className="w-16 h-16 text-[#ff4f00] mx-auto" />
                  <p className="text-sm font-semibold">PDF Document Preview</p>
                  <p className="text-xs text-[#6b6b6b]">You can view the document directly in the browser or download it.</p>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-5 py-2 bg-[#1c1b1f] hover:bg-black text-white text-xs font-bold tracking-wider uppercase rounded-none"
                  >
                    Open PDF in New Tab
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
