const xlsx = require('xlsx');
const path = require('path');

function formatExcelTime(val) {
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
    return `${displayHours}:${displayMinutes} ${ampm}`;
  }
  return String(val || '').trim();
}

function parseExcelDate(val) {
  if (typeof val === 'number') {
    const dateObj = new Date((val - 25569) * 86400 * 1000);
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val || '').trim();
}

function parseDriverDetails(detailsList) {
  let vehicleNumber = '';
  let driverName = '';
  let driverPhone = '';
  
  for (const item of detailsList) {
    if (!item) continue;
    const val = String(item).trim();
    if (val.match(/MH\s?\d{2}\s?[A-Z]{1,2}\s?\d{4}/i)) {
      vehicleNumber = val.toUpperCase().replace(/\s+/g, '');
    } else if (val.toLowerCase().includes('driver') || val.toLowerCase().includes('drver')) {
      driverName = val.replace(/(driver|drver)[:=\s-]+/gi, '').trim();
    } else if (val.toLowerCase().includes('mob') || val.toLowerCase().includes('phone') || val.match(/^\+?\d[\d\s-]{8,12}$/)) {
      driverPhone = val.replace(/(mob|phone)[:=\s-]+/gi, '').trim();
    } else if (!vehicleNumber && val.length > 5 && val.startsWith('MH')) {
      vehicleNumber = val.toUpperCase().replace(/\s+/g, '');
    } else if (!driverName && val.length > 2 && isNaN(val)) {
      driverName = val;
    } else if (!driverPhone && val.match(/\d{9,11}/)) {
      driverPhone = val;
    }
  }
  
  return { vehicleNumber, driverName, driverPhone };
}

try {
  const filePath = path.join(__dirname, 'roster.xlsx');
  const workbook = xlsx.readFile(filePath);
  
  const sheetName = workbook.SheetNames[workbook.SheetNames.length - 1]; // Let's check the last sheet
  console.log('Testing sheet:', sheetName);
  
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  let currentRouteNo = null;
  const routeBlocks = {};
  
  rows.forEach((row, idx) => {
    if (!row || row.length === 0) return;
    if (row[0] === 'Rout No' || row[0] === 'Route No') return; // Skip headers
    
    const routeNo = String(row[0] || '').trim();
    if (routeNo) {
      currentRouteNo = routeNo;
    }
    
    if (!currentRouteNo) return;
    
    if (!routeBlocks[currentRouteNo]) {
      routeBlocks[currentRouteNo] = [];
    }
    
    routeBlocks[currentRouteNo].push(row);
  });
  
  console.log(`Parsed ${Object.keys(routeBlocks).length} routes from sheet ${sheetName}`);
  
  // Now process route blocks
  const processedRoutes = [];
  
  for (const [routeNo, rRows] of Object.entries(routeBlocks)) {
    const isPickup = routeNo.startsWith('P');
    
    // Extract driver details from the column index 12 (Driver Details)
    const driverDetailsColumn = rRows.map(r => r[12]).filter(Boolean);
    const { vehicleNumber, driverName, driverPhone } = parseDriverDetails(driverDetailsColumn);
    
    // Check if there is an escort
    const hasEscort = rRows.some(r => String(r[3] || '').trim().toLowerCase() === 'escort' || String(r[4] || '').trim().toLowerCase() === 'escort');
    
    // Extract passengers
    const passengers = [];
    rRows.forEach((r, rowIdx) => {
      const empCode = String(r[3] || '').trim();
      const empName = String(r[4] || '').trim();
      const gender = String(r[13] || '').trim().toUpperCase().startsWith('F') ? 'FEMALE' : 'MALE';
      
      if (!empCode || !empName) return;
      if (empCode.toLowerCase() === 'escort' || empName.toLowerCase() === 'escort') return;
      
      const phone = String(r[5] || '').trim();
      const email = String(r[6] || '').trim();
      const address = String(r[7] || '').trim();
      const shiftTime = formatExcelTime(r[8]);
      const pickupPoint = String(r[9] || '').trim();
      const pickupTime = formatExcelTime(r[10]);
      const status = String(r[11] || 'YES').trim().toUpperCase() === 'YES' ? 'PRESENT' : 'ABSENT';
      
      passengers.push({
        empCode,
        name: empName,
        gender,
        phone,
        email,
        address,
        shiftTime,
        pickupPoint,
        pickupTime,
        status
      });
    });
    
    processedRoutes.push({
      routeNo,
      isPickup,
      vehicleNumber: vehicleNumber || `CAB-${routeNo}`,
      driverName: driverName || `Driver for ${routeNo}`,
      driverPhone: driverPhone || '9900000000',
      hasEscort,
      passengers
    });
  }
  
  // Print some samples
  console.log('\nProcessed Routes sample (First 2):');
  processedRoutes.slice(0, 2).forEach(r => {
    console.log(JSON.stringify(r, null, 2));
  });
  
  console.log('\nProcessed Routes sample (Route with Escort):');
  const escortRoute = processedRoutes.find(r => r.hasEscort);
  if (escortRoute) {
    console.log(JSON.stringify(escortRoute, null, 2));
  } else {
    console.log('No escort route found in this sheet.');
  }
  
} catch (e) {
  console.error('Error:', e);
}
