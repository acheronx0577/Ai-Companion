const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: 'http://127.0.0.1:5000',
        trace: 'on-first-retry',
    },
    webServer: {
        command: 'python app.py',
        url: 'http://127.0.0.1:5000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
            FLASK_SECRET_KEY: process.env.FLASK_SECRET_KEY || 'ci-test-secret',
        },
    },
});
