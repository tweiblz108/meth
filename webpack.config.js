const path = require("path");

module.exports = {
  entry: "./src/rat.jsx",
  output: {
    path: path.resolve(__dirname, "src"),
    filename: "rat.bundle.js"
  },
  module: {
    rules: [
      {
        test: /\.jsx$/,
        exclude: /node_modules/,
        use: ['babel-loader']
      }
    ]
  },
  mode: 'production'
};
