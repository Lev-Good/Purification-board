import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false, // each test manages its own localStorage state; keep them serial
    retries: 0,
    reporter: 'list',
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'retain-on-failure'
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    ],
    webServer: {
        command: `node tests/e2e/static-server.js`,
        port: PORT,
        env: { PORT: String(PORT) },
        reuseExistingServer: !process.env.CI
    }
});
