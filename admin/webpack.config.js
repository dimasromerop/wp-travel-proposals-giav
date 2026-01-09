const path = require('path');
const baseConfig = require('@wordpress/scripts/config/webpack.config');

module.exports = {
  ...baseConfig,
  entry: {
    index: path.resolve(__dirname, 'src/index.js'),
    portal: path.resolve(__dirname, 'src/portal/index.js'),
  },
};
