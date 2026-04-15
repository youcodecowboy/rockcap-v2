const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
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

// Ensure React/React Native aren't duplicated when resolving from sibling
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
};

module.exports = withNativeWind(config, { input: './global.css' });
