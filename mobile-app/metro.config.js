const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the parent directory so we can import from model-testing-app/convex/
config.watchFolders = [workspaceRoot];

// Resolve node_modules from both mobile-app and model-testing-app
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'model-testing-app', 'node_modules'),
];

// Ensure we don't duplicate React
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
