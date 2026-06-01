const fs = require('fs');

const path = 'src/app/dashboard/admin/transport/optimization/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// Replace Shift tag to include Trip Sequence
const shiftTagRegex = /<span className="bg-black text-white font-mono text-\[8px\] font-extrabold px-1\.5 py-0\.5 rounded uppercase tracking-wider">\s*\{route\.shift\?\.name \|\| "Shift"\}\s*<\/span>/g;

const newShiftTag = `<span className="bg-black text-white font-mono text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
  {route.shift?.name || "Shift"} A Trip {route.tripSequence || 1}
</span>`;

code = code.replace(shiftTagRegex, newShiftTag);

// Replace Vendor text to add Start/End details
const vendorRegex = /<span className="text-\[10px\] text-\[#6b6b6b\] font-semibold uppercase tracking-wider">\s*Vendor: \{route\.cab\.vendor\} A \{route\.stops\.length\} \/ \{route\.cab\.capacity\} passengers\s*<\/span>/g;

const newVendorText = `<span className="text-[10px] text-[#6b6b6b] font-semibold uppercase tracking-wider">
  Vendor: {route.cab.vendor} A {route.stops.length} / {route.cab.capacity} passengers
</span>
<div className="text-[9px] text-[#6b6b6b] mt-1.5 flex flex-col gap-0.5 border-t border-slate-100 pt-1.5">
  <div><span className="font-bold text-[#1c1b1f]">Start:</span> {route.tripSequence === 1 ? (route.cab.driverAddress || "Driver Base Location") : (route.isPickup ? "Office (Previous Trip)" : "Previous Drop-off")}</div>
  <div><span className="font-bold text-[#1c1b1f]">End:</span> {route.isPickup ? "Office / HQ" : (route.stops && route.stops.length > 0 ? "Last Employee Drop" : "N/A")}</div>
</div>`;

code = code.replace(vendorRegex, newVendorText);

fs.writeFileSync(path, code);
console.log('Modified optimization page successfully');
