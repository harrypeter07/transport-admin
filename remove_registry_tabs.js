const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'app', 'dashboard', 'admin', 'transport', 'optimization', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add useRouter import
content = content.replace(
  'import { useTransportStore, Route, RouteStop } from "@/store/useTransportStore";',
  'import { useTransportStore, Route, RouteStop } from "@/store/useTransportStore";\nimport { useRouter } from "next/navigation";'
);

// 2. Add useRouter instance
content = content.replace(
  'const [activeDesk, setActiveDesk]',
  'const router = useRouter();\n\n  const [activeDesk, setActiveDesk]'
);

// 3. Update activeDesk state definition
content = content.replace(
  'useState<"OPTIMIZER" | "REGISTRY" | "COMPLIANCE" | "ANALYSIS">("OPTIMIZER");',
  'useState<"OPTIMIZER" | "COMPLIANCE" | "ANALYSIS">("OPTIMIZER");'
);

// 4. Remove registryTab state definition
content = content.replace(
  'const [registryTab, setRegistryTab] = useState<"EMPLOYEES" | "CABS">("EMPLOYEES");',
  ''
);

// 5. Update "No Vehicles Available" banner
content = content.replace(
  'There are no cabs marked as AVAILABLE in the registry. Please go to the **Roster & Cabs Desk** to add and register vehicles.',
  'There are no cabs marked as AVAILABLE in the registry. Please go to <button onClick={() => router.push(\'/dashboard/admin/operations/cabs\')} className="text-[#ff4f00] font-bold hover:underline">Operations > Cabs</button> to add and register vehicles.'
);

// 6. Update "Register More Cabs" button
content = content.replace(
  /setActiveDesk\("REGISTRY"\);\s*setRegistryTab\("CABS"\);/g,
  'router.push(\'/dashboard/admin/operations/cabs\');'
);

// 7. Remove the DESK 2 block entirely
const desk2Start = content.indexOf('{/* DESK 2: ROSTER & CABS REGISTRY */}');
const desk3Start = content.indexOf('{/* DESK 3: COMPLIANCE WARNINGS */}');

if (desk2Start !== -1 && desk3Start !== -1) {
  content = content.slice(0, desk2Start) + content.slice(desk3Start);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('REGISTRY tabs removed successfully.');
