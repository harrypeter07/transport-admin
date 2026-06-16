const fs = require("fs");
const path = require("path");

/**
 * PHASE D FIX: --apply Flag Recognition Test & Debug
 *
 * This script validates that the --apply flag is properly recognized
 * and helps debug mode detection issues.
 */

// Test flag parsing
function parseApplyFlag(args) {
	console.log("\n=".repeat(80));
	console.log("🔍 DEBUG: APPLY FLAG PARSING");
	console.log("=".repeat(80));

	console.log(`\nProcess Arguments (process.argv):`);
	console.log(`  [0] node path: ${args[0]}`);
	console.log(`  [1] script path: ${args[1]}`);
	console.log(`  [2+] custom args: ${args.slice(2).join(", ") || "(none)"}`);

	// Get custom args (skip node and script path)
	const customArgs = args.slice(2);
	console.log(`\nCustom arguments: [${customArgs.join(", ")}]`);

	// Check for --apply flag
	const hasApplyFlag = customArgs.some(
		(arg) => arg === "--apply" || arg === "--apply=true",
	);
	const isApplyMode = hasApplyFlag;

	console.log(`\n✅ Apply flag found: ${hasApplyFlag ? "YES" : "NO"}`);
	console.log(
		`✅ Mode: ${isApplyMode ? "🔴 APPLY (MAKING CHANGES)" : "🟢 DRY-RUN (NO CHANGES)"}`,
	);

	return isApplyMode;
}

// Validate flag with detailed logging
function validateFlagRecognition() {
	console.log("\n=".repeat(80));
	console.log("✅ FLAG DETECTION TEST");
	console.log("=".repeat(80));

	const testCases = [
		{ args: ["node", "script.js"], expectedDryRun: true, label: "No flags" },
		{
			args: ["node", "script.js", "--apply"],
			expectedDryRun: false,
			label: "With --apply",
		},
		{
			args: ["node", "script.js", "--dry-run"],
			expectedDryRun: true,
			label: "With --dry-run",
		},
		{
			args: ["node", "script.js", "--verbose", "--apply"],
			expectedDryRun: false,
			label: "Multiple args with --apply",
		},
	];

	testCases.forEach((test, i) => {
		const customArgs = test.args.slice(2);
		const hasApplyFlag = customArgs.includes("--apply");
		const isDryRun = !hasApplyFlag;
		const result = isDryRun === test.expectedDryRun ? "✅ PASS" : "❌ FAIL";

		console.log(`\n  Test ${i + 1}: ${test.label}`);
		console.log(`    Args: [${test.args.join(", ")}]`);
		console.log(`    Has --apply: ${hasApplyFlag}`);
		console.log(`    Is dry-run: ${isDryRun}`);
		console.log(`    ${result}`);
	});
}

// Main execution
function main() {
	console.log("\n" + "=".repeat(80));
	console.log("PHASE D: APPLY FLAG DEBUGGING & VALIDATION");
	console.log("=".repeat(80));

	const isApplyMode = parseApplyFlag(process.argv);

	validateFlagRecognition();

	// Summary
	console.log("\n" + "=".repeat(80));
	console.log("📋 EXECUTION MODE SUMMARY");
	console.log("=".repeat(80));

	if (isApplyMode) {
		console.log(`\n🔴 APPLY MODE = TRUE`);
		console.log(`   ⚠️  DATABASE CHANGES WILL BE MADE`);
		console.log(`   ⚠️  ALL DATA MODIFICATIONS WILL BE PERMANENT`);
		console.log(`   ⚠️  Ensure you have backups!`);
	} else {
		console.log(`\n🟢 APPLY MODE = FALSE`);
		console.log(`   ✅ Running in dry-run mode`);
		console.log(`   ✅ No database changes will be made`);
		console.log(`   ✅ Safe to test`);
	}

	console.log(`\n💡 To enable apply mode, run with: --apply flag`);
	console.log(`   Example: npm run sync:gtpl -- --apply`);

	// Save debug log
	const debugLog = {
		timestamp: new Date().toISOString(),
		processArgs: process.argv,
		customArgs: process.argv.slice(2),
		isApplyMode,
		nodeVersion: process.version,
		platform: process.platform,
	};

	const logPath = path.join(
		process.cwd(),
		"data",
		"outputs",
		"debug-apply-flag.json",
	);
	const outputDir = path.dirname(logPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(logPath, JSON.stringify(debugLog, null, 2));
	console.log(`\n✅ Debug log saved to: ${logPath}`);
}

main();
