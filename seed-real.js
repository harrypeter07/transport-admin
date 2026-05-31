"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var xlsx = __importStar(require("xlsx"));
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var bcryptjs_1 = __importDefault(require("bcryptjs"));
var prisma = new client_1.PrismaClient();
function parseDriverDetails(detailsList) {
    var vehicleNumber = '';
    var driverName = '';
    var driverPhone = '';
    for (var _i = 0, detailsList_1 = detailsList; _i < detailsList_1.length; _i++) {
        var item = detailsList_1[_i];
        if (!item)
            continue;
        var val = String(item).trim();
        if (val.match(/MH\s?\d{2}\s?[A-Z]{1,2}\s?\d{4}/i))
            vehicleNumber = val.toUpperCase().replace(/\s+/g, '');
        else if (val.toLowerCase().includes('driver') || val.toLowerCase().includes('drver'))
            driverName = val.replace(/(driver|drver)[:=\s-]+/gi, '').trim();
        else if (val.toLowerCase().includes('mob') || val.toLowerCase().includes('phone') || val.match(/^\+?\d[\d\s-]{8,12}$/))
            driverPhone = val.replace(/(mob|phone)[:=\s-]+/gi, '').trim();
        else if (!vehicleNumber && val.length > 5 && val.startsWith('MH'))
            vehicleNumber = val.toUpperCase().replace(/\s+/g, '');
        else if (!driverName && val.length > 2 && isNaN(val))
            driverName = val;
        else if (!driverPhone && val.match(/\d{9,11}/))
            driverPhone = val;
    }
    return { vehicleNumber: vehicleNumber, driverName: driverName, driverPhone: driverPhone };
}
function formatExcelTime(val) {
    if (typeof val === 'number') {
        var totalMinutes = Math.round(val * 24 * 60);
        var hours = Math.floor(totalMinutes / 60);
        var minutes = totalMinutes % 60;
        var ampm = hours >= 12 ? 'PM' : 'AM';
        var displayHours = hours % 12 === 0 ? 12 : hours % 12;
        var displayMinutes = minutes < 10 ? '0' + minutes : minutes;
        return displayHours + ':' + displayMinutes + ' ' + ampm;
    }
    return String(val || '').trim();
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var filePath, buffer, workbook, defaultPassword, routeBlocks, uniqueEmployeeCodes, _loop_1, _i, _a, sheetName, importedEmployeesCount, importedCabsCount, _b, _c, _d, routeNo, rRows, driverDetailsColumn, _e, vehicleNumber, driverName, driverPhone, finalVehicleNumber, finalDriverName, finalDriverPhone, existingCab, capacity, shift, _f, rRows_1, r, empCode, empName, phone, email, address, phoneDigits, finalEmpCode, finalEmail, employeeStatus, gender, user, employee, xVal, yVal, dummyShift, _g, mUser, mEmp, eUser, dUser;
        var _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    filePath = path.join(process.cwd(), 'roster.xlsx');
                    buffer = fs.readFileSync(filePath);
                    workbook = xlsx.read(buffer, { type: 'buffer' });
                    return [4 /*yield*/, bcryptjs_1.default.hash('Welcome@123', 10)];
                case 1:
                    defaultPassword = _j.sent();
                    routeBlocks = {};
                    uniqueEmployeeCodes = new Set();
                    _loop_1 = function (sheetName) {
                        var sheet = workbook.Sheets[sheetName];
                        var rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                        var currentRouteNo = null;
                        rows.forEach(function (row) {
                            if (!row || row.length === 0)
                                return;
                            if (row[0] === 'Rout No' || row[0] === 'Route No')
                                return;
                            var routeNo = String(row[0] || '').trim();
                            if (routeNo)
                                currentRouteNo = routeNo;
                            if (!currentRouteNo)
                                return;
                            var empCode = String(row[3] || '').trim();
                            var rowKey = currentRouteNo + '_' + empCode;
                            if (!uniqueEmployeeCodes.has(rowKey)) {
                                uniqueEmployeeCodes.add(rowKey);
                                if (!routeBlocks[currentRouteNo])
                                    routeBlocks[currentRouteNo] = [];
                                routeBlocks[currentRouteNo].push(row);
                            }
                        });
                    };
                    for (_i = 0, _a = workbook.SheetNames; _i < _a.length; _i++) {
                        sheetName = _a[_i];
                        _loop_1(sheetName);
                    }
                    importedEmployeesCount = 0;
                    importedCabsCount = 0;
                    _b = 0, _c = Object.entries(routeBlocks);
                    _j.label = 2;
                case 2:
                    if (!(_b < _c.length)) return [3 /*break*/, 17];
                    _d = _c[_b], routeNo = _d[0], rRows = _d[1];
                    driverDetailsColumn = rRows.map(function (r) { return r[12]; }).filter(Boolean);
                    _e = parseDriverDetails(driverDetailsColumn), vehicleNumber = _e.vehicleNumber, driverName = _e.driverName, driverPhone = _e.driverPhone;
                    finalVehicleNumber = vehicleNumber || 'CAB-' + routeNo;
                    finalDriverName = driverName || 'Driver ' + routeNo;
                    finalDriverPhone = driverPhone || '+91 99000 00000';
                    return [4 /*yield*/, prisma.cab.findUnique({ where: { vehicleNumber: finalVehicleNumber } })];
                case 3:
                    existingCab = _j.sent();
                    if (!!existingCab) return [3 /*break*/, 5];
                    capacity = Math.max(6, rRows.filter(function (r) { return r[3] && String(r[3]).toLowerCase() !== 'escort'; }).length);
                    return [4 /*yield*/, prisma.cab.create({
                            data: {
                                vehicleNumber: finalVehicleNumber,
                                capacity: capacity,
                                vendor: String(((_h = rRows[0]) === null || _h === void 0 ? void 0 : _h[1]) || 'FT').trim(),
                                status: 'AVAILABLE',
                                driverName: finalDriverName,
                                driverPhone: finalDriverPhone,
                                licenseNumber: 'DL-AUTO-' + Math.floor(1000 + Math.random() * 9000),
                            },
                        })];
                case 4:
                    existingCab = _j.sent();
                    importedCabsCount++;
                    _j.label = 5;
                case 5: return [4 /*yield*/, prisma.shift.findFirst()];
                case 6:
                    shift = _j.sent();
                    if (!!shift) return [3 /*break*/, 8];
                    return [4 /*yield*/, prisma.shift.create({
                            data: {
                                name: 'Standard Day Shift',
                                startTime: '09:00',
                                endTime: '18:00',
                            },
                        })];
                case 7:
                    shift = _j.sent();
                    _j.label = 8;
                case 8:
                    _f = 0, rRows_1 = rRows;
                    _j.label = 9;
                case 9:
                    if (!(_f < rRows_1.length)) return [3 /*break*/, 16];
                    r = rRows_1[_f];
                    empCode = String(r[3] || '').trim();
                    empName = String(r[4] || '').trim();
                    if (!empCode || !empName)
                        return [3 /*break*/, 15];
                    if (empCode.toLowerCase() === 'escort' || empName.toLowerCase() === 'escort')
                        return [3 /*break*/, 15];
                    phone = String(r[5] || '').trim() || '+91 99000 00000';
                    email = String(r[6] || '').trim();
                    address = String(r[7] || '').trim() || 'Nagpur';
                    phoneDigits = phone.replace(/\D/g, '').slice(-4) || '0000';
                    finalEmpCode = (empCode === 'NA' || empCode === '#######' || empCode === '')
                        ? 'EMP-' + empName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '-' + phoneDigits
                        : empCode;
                    finalEmail = email && email.includes('@') ? email : finalEmpCode.toLowerCase().replace(/[^a-z0-9]/g, '') + '.' + phoneDigits + '@corporate.com';
                    employeeStatus = String(r[11] || 'YES').trim().toUpperCase() === 'YES' ? 'ACTIVE' : 'INACTIVE';
                    gender = String(r[13] || 'M').trim().toUpperCase().startsWith('F') ? 'FEMALE' : 'MALE';
                    return [4 /*yield*/, prisma.user.findUnique({ where: { email: finalEmail } })];
                case 10:
                    user = _j.sent();
                    if (!!user) return [3 /*break*/, 12];
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: finalEmail,
                                password: defaultPassword,
                                name: empName,
                                role: (empCode.includes('MGR') || String(r[10] || '').toLowerCase().includes('manager')) ? 'MANAGER' : 'EMPLOYEE',
                                requiresPasswordChange: true,
                            },
                        })];
                case 11:
                    user = _j.sent();
                    _j.label = 12;
                case 12: return [4 /*yield*/, prisma.employee.findFirst({
                        where: { OR: [{ employeeCode: finalEmpCode }, { email: finalEmail }] }
                    })];
                case 13:
                    employee = _j.sent();
                    if (!!employee) return [3 /*break*/, 15];
                    xVal = Math.round((79.00 + Math.random() * 0.20) * 10000) / 10000;
                    yVal = Math.round((21.04 + Math.random() * 0.18) * 10000) / 10000;
                    return [4 /*yield*/, prisma.employee.create({
                            data: {
                                employeeCode: finalEmpCode,
                                name: empName,
                                gender: gender,
                                phone: phone,
                                email: finalEmail,
                                address: address,
                                x: xVal,
                                y: yVal,
                                department: 'Operations',
                                shiftId: shift.id,
                                status: employeeStatus,
                                userId: user.id,
                            },
                        })];
                case 14:
                    _j.sent();
                    importedEmployeesCount++;
                    _j.label = 15;
                case 15:
                    _f++;
                    return [3 /*break*/, 9];
                case 16:
                    _b++;
                    return [3 /*break*/, 2];
                case 17: return [4 /*yield*/, prisma.shift.findFirst()];
                case 18:
                    _g = (_j.sent());
                    if (_g) return [3 /*break*/, 20];
                    return [4 /*yield*/, prisma.shift.create({
                            data: { name: 'Dummy Shift', startTime: '09:00', endTime: '18:00' }
                        })];
                case 19:
                    _g = (_j.sent());
                    _j.label = 20;
                case 20:
                    dummyShift = _g;
                    return [4 /*yield*/, prisma.user.upsert({
                            where: { email: 'manager_test@transitadmin.com' },
                            update: { password: defaultPassword, requiresPasswordChange: false },
                            create: { email: 'manager_test@transitadmin.com', name: 'Test Manager', password: defaultPassword, role: 'MANAGER', requiresPasswordChange: false }
                        })];
                case 21:
                    mUser = _j.sent();
                    return [4 /*yield*/, prisma.employee.upsert({
                            where: { email: 'manager_test@transitadmin.com' },
                            update: {},
                            create: { employeeCode: 'TEST-MGR-01', name: 'Test Manager', gender: 'MALE', phone: '+91 9999999991', email: 'manager_test@transitadmin.com', address: 'Nagpur', x: 79.088, y: 21.145, department: 'Test', shiftId: dummyShift.id, status: 'ACTIVE', userId: mUser.id }
                        })];
                case 22:
                    mEmp = _j.sent();
                    return [4 /*yield*/, prisma.user.upsert({
                            where: { email: 'employee_test@transitadmin.com' },
                            update: { password: defaultPassword, requiresPasswordChange: false },
                            create: { email: 'employee_test@transitadmin.com', name: 'Test Employee', password: defaultPassword, role: 'EMPLOYEE', requiresPasswordChange: false }
                        })];
                case 23:
                    eUser = _j.sent();
                    return [4 /*yield*/, prisma.employee.upsert({
                            where: { email: 'employee_test@transitadmin.com' },
                            update: {},
                            create: { employeeCode: 'TEST-EMP-01', name: 'Test Employee', gender: 'FEMALE', phone: '+91 9999999992', email: 'employee_test@transitadmin.com', address: 'Nagpur', x: 79.089, y: 21.146, department: 'Test', shiftId: dummyShift.id, managerId: mEmp.id, status: 'ACTIVE', userId: eUser.id }
                        })];
                case 24:
                    _j.sent();
                    return [4 /*yield*/, prisma.user.upsert({
                            where: { email: 'driver_test@transitadmin.com' },
                            update: { password: defaultPassword, requiresPasswordChange: false },
                            create: { email: 'driver_test@transitadmin.com', name: 'Test Driver', password: defaultPassword, role: 'DRIVER', requiresPasswordChange: false }
                        })];
                case 25:
                    dUser = _j.sent();
                    return [4 /*yield*/, prisma.cab.upsert({
                            where: { vehicleNumber: 'TEST CAB 01' },
                            update: {},
                            create: { vehicleNumber: 'TEST CAB 01', capacity: 6, vendor: 'Test Transport', status: 'AVAILABLE', driverName: 'Test Driver', driverPhone: '+91 9999999993', licenseNumber: 'DL-TEST-01', shiftId: dummyShift.id }
                        })];
                case 26:
                    _j.sent();
                    console.log('Imported ' + importedEmployeesCount + ' employees and ' + importedCabsCount + ' cabs from roster.');
                    console.log('Created completely dummy test accounts!');
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(console.error).finally(function () { return prisma.$disconnect(); });
