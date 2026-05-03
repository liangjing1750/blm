const fs = require('node:fs');
const path = require('node:path');

const baseConfig = require('./playwright.config');
const toolDir = __dirname;
const workspaceDir = path.join(toolDir, '.tmp', 'playwright-demo-workspace');

fs.rmSync(workspaceDir, { recursive: true, force: true });
fs.mkdirSync(workspaceDir, { recursive: true });
process.env.BLM_E2E_WORKSPACE_DIR = workspaceDir;

module.exports = {
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: 'http://127.0.0.1:8900',
    headless: false,
    trace: 'on',
    video: 'on',
    launchOptions: {
      slowMo: 600,
    },
  },
  webServer: {
    ...baseConfig.webServer,
    url: 'http://127.0.0.1:8900',
    env: {
      ...baseConfig.webServer.env,
      BLM_PORT: '8900',
      BLM_WORKSPACE_DIR: workspaceDir,
    },
  },
};
