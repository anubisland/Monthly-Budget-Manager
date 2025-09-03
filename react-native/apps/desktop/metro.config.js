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
