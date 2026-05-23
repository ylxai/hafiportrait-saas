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
} catch (error) {
  if (process.env.CI) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(".env.test file is required in CI environment");
    }
    throw error;
  }
  console.warn("No .env.test file found, using default environment");
}

// Validate required environment variables
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required in .env.test");
}
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET is required in .env.test");
}

export default defineConfig({
  testDir: "./tests/e2e",
  // Database isolation requires sequential execution per worker
  fullyParallel: false,
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
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "admin",
      testDir: "./tests/e2e/admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup"],
      timeout: 60000,
    },
    {
      name: "client",
      testDir: "./tests/e2e/client-portal",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/client.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "public",
      testDir: "./tests/e2e/public",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "integration",
      testDir: "./tests/e2e/integration",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      timeout: 60000,
    },
  ],
  webServer: process.env.CI
    ? {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 120000,
        // Only worker 0 starts dev server in CI to prevent concurrent starts
        port: 3000,
      }
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120000,
      },
});
