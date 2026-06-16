import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
	dest: "public",
	disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
	// Prevent Next.js from bundling Prisma — it loads from node_modules at
	// runtime so `prisma generate` takes effect immediately, no restart needed.
	serverExternalPackages: ["@prisma/client", ".prisma/client"],
	outputFileTracingRoot: process.cwd(),
	outputFileTracingIncludes: {
		"/api/**/*": ["./prisma/dev.db", "./data/excel_routes.json"],
	},
	turbopack: {},
	// Disable source maps in production to reduce build memory usage
	productionBrowserSourceMaps: false,
	// Suppress console warnings for cleaner output
	onDemandEntries: {
		maxInactiveAge: 60 * 1000,
		pagesBufferLength: 5,
	},
	webpack: (config, { isServer, dev }) => {
		// Limit parallelism to prevent RAM exhaustion on low-memory machines
		config.parallelism = 1;

		// Disable source maps during production build to save memory
		if (!dev) {
			config.devtool = false;
		}

		// Reduce memory pressure from the filesystem cache
		if (config.cache && typeof config.cache === "object") {
			(config.cache as any).maxMemoryGenerations = 1;
		}

		return config;
	},
};

export default withPWA(nextConfig);
