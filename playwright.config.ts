import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load test environment variables
try {
  const envTest = readFileSync(resolve(__dirname, ".env.test"), "utf-8");
  envTest.split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      process.env[key.trim()] = value.trim();
    }
  });
} catch {
  console.warn("No .env.test file found, using default environment");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [["html"], ["json", { outputFile: "test-results.json" }]],
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "admin",
      testDir: "./tests/e2e/admin",
      use: { ...devices["Desktop Chrome"] },
      timeout: 60000,
    },
    {
      name: "client",
      testDir: "./tests/e2e/client-portal",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "public",
      testDir: "./tests/e2e/public",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "integration",
      testDir: "./tests/e2e/integration",
      use: { ...devices["Desktop Chrome"] },
      timeout: 60000,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
