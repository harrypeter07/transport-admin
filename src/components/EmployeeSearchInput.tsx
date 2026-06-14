"use client";

import { Search, X } from "lucide-react";

interface EmployeeSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function EmployeeSearchInput({
  value,
  onChange,
  placeholder = "Search employee, code, address, driver…",
  className = "",
}: EmployeeSearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9a9a9a] pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-8 py-1.5 text-xs border border-[#e8e8e8] bg-white rounded-none outline-none focus:border-[#1c1b1f] placeholder:text-[#b0b0b0]"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9a9a9a] hover:text-[#1c1b1f]"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
