const path = require('node:path');

const toolDir = path.resolve(__dirname, '..', '..');
const workspaceDir =
  process.env.BLM_E2E_WORKSPACE_DIR ||
  path.join(toolDir, '.tmp', 'playwright-workspace');

module.exports = {
  workspaceDir,
};
