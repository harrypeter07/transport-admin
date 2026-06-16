import React, { useState, useMemo } from 'react';
import { Search, MapPin, Clock, AlertCircle } from 'lucide-react';

interface EmployeeSearchResult {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  zone: string;
  shift: string;
  shiftTime: string;
  lat: number;
  lng: number;
}

interface EmployeeSearchBarProps {
  employees: any[];
  shifts: any[];
  onSelectEmployee?: (employee: EmployeeSearchResult) => void;
}

export default function EmployeeSearchBar({ 
  employees, 
  shifts,
  onSelectEmployee 
}: EmployeeSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);

  // Search and filter employees
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    return employees
      .filter(emp => 
        emp.name?.toLowerCase().includes(query) ||
        emp.email?.toLowerCase().includes(query) ||
        emp.phone?.includes(query)
      )
      .map(emp => {
        const shift = shifts?.find(s => s.id === emp.shiftId);
        return {
          id: emp.id,
          name: emp.name,
          email: emp.email || 'N/A',
          phone: emp.phone || 'N/A',
          address: emp.address || 'N/A',
          zone: emp.zone || 'N/A',
          shift: shift?.name || 'No Shift',
          shiftTime: shift ? `${shift.startTime} - ${shift.endTime}` : 'N/A',
          lat: emp.x || 0,
          lng: emp.y || 0,
        };
      })
      .slice(0, 10); // Limit to 10 results
  }, [searchQuery, employees, shifts]);

  const handleSelectEmployee = (result: EmployeeSearchResult) => {
    setShowResults(false);
    setSearchQuery('');
    onSelectEmployee?.(result);
  };

  const zoneColors: Record<string, string> = {
    'N': 'bg-blue-100 text-blue-800',
    'S': 'bg-red-100 text-red-800',
    'E': 'bg-green-100 text-green-800',
    'W': 'bg-purple-100 text-purple-800',
  };

  return (
    <div className="relative w-full max-w-md">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Search employee by name, email, or phone..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Results Dropdown */}
      {showResults && searchQuery && searchResults.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {searchResults.map((result) => (
            <div
              key={result.id}
              onClick={() => handleSelectEmployee(result)}
              className="p-4 border-b hover:bg-gray-50 cursor-pointer transition"
            >
              {/* Employee Name and Zone */}
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-gray-900">{result.name}</div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${zoneColors[result.zone] || 'bg-gray-100'}`}>
                  Zone {result.zone}
                </span>
              </div>

              {/* Contact Info */}
              <div className="text-sm text-gray-600 mb-2">
                📧 {result.email} | 📱 {result.phone}
              </div>

              {/* Address */}
              <div className="flex items-start gap-2 text-sm text-gray-600 mb-2">
                <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                <span>{result.address}</span>
              </div>

              {/* Shift */}
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 bg-gray-100 p-2 rounded">
                <Clock size={16} />
                <span>{result.shift}</span>
                <span className="text-gray-500 text-xs">({result.shiftTime})</span>
              </div>

              {/* Coordinates */}
              <div className="text-xs text-gray-500 mt-2">
                📍 {result.lat.toFixed(4)}, {result.lng.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {showResults && searchQuery && searchResults.length === 0 && (
        <div className="absolute top-full mt-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500 z-50">
          <AlertCircle className="mx-auto mb-2" size={20} />
          No employees found matching "{searchQuery}"
        </div>
      )}
    </div>
  );
}
