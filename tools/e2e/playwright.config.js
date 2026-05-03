const fs = require('node:fs');
const path = require('node:path');

const toolDir = __dirname;
const repoRoot = path.resolve(toolDir, '..', '..');
const workspaceDir = path.join(toolDir, '.tmp', 'playwright-workspace');

fs.rmSync(workspaceDir, { recursive: true, force: true });
fs.mkdirSync(workspaceDir, { recursive: true });
process.env.BLM_E2E_WORKSPACE_DIR = workspaceDir;

module.exports = {
  testDir: path.join(toolDir, 'tests'),
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8899',
    headless: true,
  },
  webServer: {
    command: 'python blm.py',
    url: 'http://127.0.0.1:8899',
    reuseExistingServer: false,
    timeout: 30_000,
    cwd: repoRoot,
    env: {
      ...process.env,
      BLM_PORT: '8899',
      BLM_NO_BROWSER: '1',
      BLM_WORKSPACE_DIR: workspaceDir,
    },
  },
};
