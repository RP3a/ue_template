const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");



function initCanisterEnv() {
  let localCanisters, prodCanisters, canisters;
 
  try {
    localCanisters = require(path.resolve(
      ".dfx",
      "local",
      "canister_ids.json"
    ));
  } catch (error) {
    console.log("No local canister_ids.json found. Continuing production");
  }
  try {
    prodCanisters = require(path.resolve("canister_ids.json"));
  } catch (error) {
    console.log("No production canister_ids.json found. Continuing with local");
  }

  const network =
    process.env.DFX_NETWORK ||
    (process.env.NODE_ENV === "production" ? "ic" : "local");

  const canisterConfig = network === "local" ? localCanisters : prodCanisters;
  canisters = network === "local" ? localCanisters : prodCanisters;

  for (const canister in canisters) {
    process.env[canister.toUpperCase() + "_CANISTER_ID"] =
      canisters[canister][network];
  }

  return canisters

  // return Object.entries(canisterConfig).reduce((prev, current) => {
  //   const [canisterName, canisterDetails] = current;
  //   prev[canisterName.toUpperCase() + "_CANISTER_ID"] =
  //     canisterDetails[network];
  //   return prev;
  // }, {});
}
const canisterEnvVariables = initCanisterEnv();

const canisters = initCanisterEnv();

const isDevelopment = process.env.NODE_ENV !== "production";

const frontendDirectory = "ue_template_assets";

const asset_entry = path.join("src", frontendDirectory, "src", "index.html");

module.exports = {
  target: "web",
  mode: isDevelopment ? "development" : "production",
  entry: {
    // The frontend.entrypoint points to the HTML file for this build, so we need
    // to replace the extension to `.js`.
    index: path.join(__dirname, asset_entry).replace(/\.html$/, ".tsx"),
    peer_stream: path.join(__dirname, "src", frontendDirectory, "src", "peer-stream.js"),
    
  },
  devtool: isDevelopment ? "source-map" : false,
  optimization: {
    minimize: !isDevelopment,
    minimizer: [new TerserPlugin()],
  },
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx"],
    fallback: {
      assert: require.resolve("assert/"),
      buffer: require.resolve("buffer/"),
      events: require.resolve("events/"),
      stream: require.resolve("stream-browserify/"),
      util: require.resolve("util/"),
    },
  },
  output: {
    filename: "[name].js",
    path: path.join(__dirname, "dist", frontendDirectory),
  },

  // Depending in the language or framework you are using for
  // front-end development, add module loaders to the default
  // webpack configuration. For example, if you are using React
  // modules and CSS as described in the "Adding a stylesheet"
  // tutorial, uncomment the following lines:
  module: {
   rules: [
     { test: /\.(ts|tsx|jsx)$/, loader: "ts-loader" },
     { test: /\.css$/, use: ['style-loader','css-loader'] }
   ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, asset_entry),
      cache: false,
    }),
    new CopyPlugin({
      patterns: [
        {
          from: path.join(__dirname, "src", frontendDirectory, "assets"),
          to: path.join(__dirname, "dist", frontendDirectory),
        },
      ],
    }),
    new webpack.EnvironmentPlugin({
      NODE_ENV: "development",
      //...canisterEnvVariables,
      UE_TEMPLATE_CANISTER_ID: canisters["ue_template"],
      II_URL: isDevelopment        
        ? "http://localhost:8080/#authorize"        
        : "https://identity.ic0.app/#authorize",
    }),
    new webpack.ProvidePlugin({
      Buffer: [require.resolve("buffer/"), "Buffer"],
      process: require.resolve("process/browser"),
    }),
  ],
  // proxy /api to port 8000 during development
  devServer: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        pathRewrite: {
          "^/api": "/api",
        },
      },
    },
    hot: true,
    watchFiles: [path.resolve(__dirname, "src", frontendDirectory)],
    liveReload: true,
  },
};
