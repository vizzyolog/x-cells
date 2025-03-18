const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const outputPath = path.resolve(__dirname, '../dist');

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: './src/index.js',
    output: {
        filename: 'bundle.js',
        path: outputPath,
        clean: true,
    },
    devServer: process.env.NODE_ENV === 'development' ? {
        static: outputPath,
        //hot: true,
        open: true,
        port: 3000,
        devMiddleware: {
            writeToDisk: true,
        },
    } : undefined,
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                },
            }
        ],
    },
    experiments: {
        asyncWebAssembly: true,
        syncWebAssembly: true,
        topLevelAwait: true,
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
        }),
        new CopyWebpackPlugin({
            patterns: [
                { 
                    from: 'public',
                    to: outputPath,
                    globOptions: { ignore: ['**/index.html'] }
                }
            ],
        }),
    ],
    resolve: {
        alias: {
            'three': path.resolve(__dirname, 'node_modules/three')
        },
        fallback: {
            "fs": false,
            "path": false,
        },
    },
    cache: false,
};