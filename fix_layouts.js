const fs = require('fs');
const path = require('path');

function processLayout(filePath, role) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('useState') && content.includes('sidebarOpen')) {
    return; // Already processed
  }

  // 1. Add useState, useEffect, Menu, X imports
  content = content.replace(
    /import Link from "next\/link";\nimport { usePathname } from "next\/navigation";/g,
    `import Link from "next/link";\nimport { usePathname } from "next/navigation";\nimport { useState, useEffect } from "react";`
  );
  
  content = content.replace(
    /(import \{[^\}]+)(\} from "lucide-react";)/,
    `$1, Menu, X $2`
  );

  // 2. Extract SidebarNav component logic
  let navItemsMatch = content.match(/const (navItems|navGroups) = \[\s*[\s\S]*?\s*\];/);
  let isNavGroups = navItemsMatch[1] === 'navGroups';

  let navInnerContent = '';
  if (isNavGroups) {
    navInnerContent = `
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="text-[9px] font-bold text-[#b0b0b0] uppercase tracking-widest mb-1.5 px-2">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.href === "/dashboard/${role}"
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={\`flex items-center gap-2.5 px-2.5 py-2.5 text-sm font-medium transition-colors \${
                      isActive
                        ? "bg-[#ff4f00] text-white"
                        : "text-[#4a4a4a] hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
                    }\`}
                  >
                    <Icon className={\`w-4 h-4 flex-shrink-0 \${isActive ? "text-white" : "text-[#9a9a9a]"}\`} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
    `;
  } else {
    navInnerContent = `
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard/${role}"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={\`flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium transition-colors \${
                  isActive
                    ? "bg-[#ff4f00] text-white"
                    : "text-[#4a4a4a] hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
                }\`}
              >
                <Icon
                  className={\`w-4 h-4 flex-shrink-0 \${
                    isActive ? "text-white" : "text-[#9a9a9a]"
                  }\`}
                />
                {item.name}
              </Link>
            );
          })}
    `;
  }

  // 3. Rewrite the component
  let LayoutName = content.match(/export default function ([a-zA-Z]+)/)[1];

  let activeItemLogic = isNavGroups 
    ? `const allItems = navGroups.flatMap((g) => g.items);
  const activeItem = allItems.find((i) =>
    i.href === "/dashboard/${role}" ? pathname === i.href : pathname.startsWith(i.href)
  );`
    : `const activeItem = navItems.find((i) =>
    i.href === "/dashboard/${role}" ? pathname === i.href : pathname.startsWith(i.href)
  );`;

  let newComponentStr = `export default function ${LayoutName}({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  ${activeItemLogic}

  function SidebarNav() {
    return (
      <nav className="flex-1 py-4 px-3 flex flex-col gap-0.5">
${navInnerContent}
      </nav>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] relative">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={\`fixed z-50 w-64 bg-white border-r border-[#e8e8e8] flex flex-col overflow-y-auto transition-transform duration-300 md:hidden\`}
        style={{ top: "56px", bottom: 0, left: 0, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8e8]">
          <span className="text-xs font-bold uppercase tracking-widest text-[#9a9a9a]">Navigation</span>
          <button onClick={() => setSidebarOpen(false)} className="p-1 text-[#6b6b6b] hover:text-[#1c1b1f]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <SidebarNav />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 border-r border-[#e8e8e8] bg-white flex-col sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
        <SidebarNav />
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-8 bg-[#f7f7f7]">
        {/* Mobile nav bar */}
        <div className="md:hidden flex items-center gap-3 px-1 py-3 mb-4 border-b border-[#e8e8e8]/50">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 bg-white text-[#6b6b6b] hover:text-[#1c1b1f] border border-[#e8e8e8] shadow-xs transition"
            aria-label="Open navigation"
          >
            <Menu className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-[#1c1b1f] tracking-tight">
            {activeItem?.name ?? "${LayoutName.replace('Layout', '')}"}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}`;

  content = content.replace(/export default function [\s\S]*?(?=$)/, newComponentStr);
  fs.writeFileSync(filePath, content, 'utf8');
}

processLayout(path.join(__dirname, 'src/app/dashboard/driver/layout.tsx'), 'driver');
processLayout(path.join(__dirname, 'src/app/dashboard/employee/layout.tsx'), 'employee');
processLayout(path.join(__dirname, 'src/app/dashboard/manager/layout.tsx'), 'manager');

console.log("Layouts processed");
