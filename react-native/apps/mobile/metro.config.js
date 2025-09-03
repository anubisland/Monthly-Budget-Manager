// Minimal Metro config for React Native
const { getDefaultConfig } = require('metro-config');

module.exports = (async () => {
  const {
    resolver: { sourceExts, assetExts },
  } = await getDefaultConfig();
  return {
    resolver: {
      assetExts,
      sourceExts: [...sourceExts, 'cjs', 'mjs', 'ts', 'tsx'],
    },
  };
})();
