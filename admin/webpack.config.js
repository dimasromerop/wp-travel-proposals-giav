const path = require('path');
const baseConfig = require('@wordpress/scripts/config/webpack.config');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const plugins = (baseConfig.plugins || []).map((plugin) => {
  if (plugin && plugin.constructor && plugin.constructor.name === 'MiniCssExtractPlugin') {
    return new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: '[name].[contenthash:8].css',
    });
  }
  return plugin;
});

module.exports = {
  ...baseConfig,
  entry: {
    index: path.resolve(__dirname, 'src/index.js'),
    portal: path.resolve(__dirname, 'src/portal/index.js'),
  },
  output: {
    ...baseConfig.output,
    filename: '[name].js',
    chunkFilename: '[name].[contenthash:8].js',
  },
  plugins,
};
