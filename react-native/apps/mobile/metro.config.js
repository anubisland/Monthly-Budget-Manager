const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [
    // Include the parent directories for monorepo support
    path.resolve(__dirname, '../..'), // react-native root
    path.resolve(__dirname, '../../packages'), // packages
  ],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '../../node_modules'), // monorepo root node_modules
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
