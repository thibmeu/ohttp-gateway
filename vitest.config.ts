import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "node",
					include: ["test/**/*.test.ts"],
					exclude: ["test/**/*.workers.test.ts"],
				},
			},
			{
				plugins: [
					cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } }),
				],
				test: { name: "workers", include: ["test/**/*.workers.test.ts"] },
			},
		],
	},
});
