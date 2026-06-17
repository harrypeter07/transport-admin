import fs from "fs";
import os from "os";
import path from "path";

const LOCAL_DIR = path.join(process.cwd(), "data", "uploads");
const TMP_DIR = path.join(os.tmpdir(), "etms-uploads");

function ensureDir(dir: string) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

/** Best-effort persist for local dev; parse should also accept file bytes in-request. */
export function saveUploadBuffer(fileKey: string, buffer: Buffer): string | null {
	for (const dir of [TMP_DIR, LOCAL_DIR]) {
		try {
			ensureDir(dir);
			const filePath = path.join(dir, `${fileKey}.xlsx`);
			fs.writeFileSync(filePath, buffer);
			return filePath;
		} catch (e) {
			console.warn(`[upload] Could not write to ${dir}:`, e);
		}
	}
	return null;
}

export function resolveUploadBuffer(fileKey: string): Buffer | null {
	for (const filePath of [
		path.join(TMP_DIR, `${fileKey}.xlsx`),
		path.join(LOCAL_DIR, `${fileKey}.xlsx`),
	]) {
		if (fs.existsSync(filePath)) {
			return fs.readFileSync(filePath);
		}
	}
	return null;
}
