"use strict";
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
var bcryptjs_1 = __importDefault(require("bcryptjs"));
var prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var defaultPassword, dummyShift, _a, mUser, mEmp, eUser, dUser;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, bcryptjs_1.default.hash('Welcome@123', 10)];
                case 1:
                    defaultPassword = _b.sent();
                    return [4 /*yield*/, prisma.shift.findFirst()];
                case 2:
                    _a = (_b.sent());
                    if (_a) return [3 /*break*/, 4];
                    return [4 /*yield*/, prisma.shift.create({
                            data: { name: 'Dummy Shift', startTime: '09:00', endTime: '18:00' }
                        })];
                case 3:
                    _a = (_b.sent());
                    _b.label = 4;
                case 4:
                    dummyShift = _a;
                    return [4 /*yield*/, prisma.user.upsert({
                            where: { email: 'manager_test@transitadmin.com' },
                            update: { password: defaultPassword, requiresPasswordChange: false },
                            create: { email: 'manager_test@transitadmin.com', name: 'Test Manager', password: defaultPassword, role: 'MANAGER', requiresPasswordChange: false }
                        })];
                case 5:
                    mUser = _b.sent();
                    return [4 /*yield*/, prisma.employee.upsert({
                            where: { email: 'manager_test@transitadmin.com' },
                            update: {},
                            create: { employeeCode: 'TEST-MGR-01', name: 'Test Manager', gender: 'MALE', phone: '+91 9999999991', email: 'manager_test@transitadmin.com', address: 'Nagpur', x: 79.088, y: 21.145, department: 'Test', shiftId: dummyShift.id, status: 'ACTIVE', userId: mUser.id }
                        })];
                case 6:
                    mEmp = _b.sent();
                    return [4 /*yield*/, prisma.user.upsert({
                            where: { email: 'employee_test@transitadmin.com' },
                            update: { password: defaultPassword, requiresPasswordChange: false },
                            create: { email: 'employee_test@transitadmin.com', name: 'Test Employee', password: defaultPassword, role: 'EMPLOYEE', requiresPasswordChange: false }
                        })];
                case 7:
                    eUser = _b.sent();
                    return [4 /*yield*/, prisma.employee.upsert({
                            where: { email: 'employee_test@transitadmin.com' },
                            update: {},
                            create: { employeeCode: 'TEST-EMP-01', name: 'Test Employee', gender: 'FEMALE', phone: '+91 9999999992', email: 'employee_test@transitadmin.com', address: 'Nagpur', x: 79.089, y: 21.146, department: 'Test', shiftId: dummyShift.id, managerId: mEmp.id, status: 'ACTIVE', userId: eUser.id }
                        })];
                case 8:
                    _b.sent();
                    return [4 /*yield*/, prisma.user.upsert({
                            where: { email: 'driver_test@transitadmin.com' },
                            update: { password: defaultPassword, requiresPasswordChange: false },
                            create: { email: 'driver_test@transitadmin.com', name: 'Test Driver', password: defaultPassword, role: 'DRIVER', requiresPasswordChange: false }
                        })];
                case 9:
                    dUser = _b.sent();
                    return [4 /*yield*/, prisma.cab.upsert({
                            where: { vehicleNumber: 'TEST CAB 01' },
                            update: {},
                            create: { vehicleNumber: 'TEST CAB 01', capacity: 6, vendor: 'Test Transport', status: 'AVAILABLE', driverName: 'Test Driver', driverPhone: '+91 9999999993', licenseNumber: 'DL-TEST-01', shiftId: dummyShift.id }
                        })];
                case 10:
                    _b.sent();
                    console.log('Created completely dummy test accounts!');
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(console.error).finally(function () { return prisma.$disconnect(); });
