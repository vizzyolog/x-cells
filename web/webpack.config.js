const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const outputPath = path.resolve(__dirname, '../dist');

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: './src/index.js',
    devtool: process.env.NODE_ENV === 'production' 
        ? 'source-map'     // Для production - более компактные source maps
        : 'eval-source-map', // Для development - лучшая отладка
    output: {
        filename: 'bundle.[contenthash].js',
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
            inject: 'body',
            scriptLoading: 'defer',
            templateParameters: (compilation, assets, assetTags, options) => {
                return {
                    compilation: compilation,
                    webpackConfig: compilation.options,
                    htmlWebpackPlugin: {
                        tags: assetTags,
                        files: assets,
                        options: options
                    },
                    scriptSrc: assets.js[0]
                };
            }
        }),
        new CopyWebpackPlugin({
            patterns: [
                { 
                    from: 'public',
                    to: outputPath,
                    globOptions: { ignore: ['**/index.html'] }
                },
                // Копируем тестовый файл из корневой директории
                {
                    from: '../test-eyes.html',
                    to: path.join(outputPath, 'test-eyes.html'),
                    noErrorOnMissing: true
                },
                // Добавляем копирование Ammo.js из CDN или локальной папки
                {
                    from: 'node_modules/ammo.js/builds/ammo.wasm.js',
                    to: path.join(outputPath, 'ammo.wasm.js'),
                    noErrorOnMissing: true // Не выдаёт ошибку, если файл не найден
                },
                {
                    from: '../assets/ammo.wasm.js',
                    to: path.join(outputPath, 'ammo.wasm.js'),
                    noErrorOnMissing: true
                }
            ],
        }),
    ],
    resolve: {
        alias: {
            // Убеждаемся, что везде используется один и тот же экземпляр three.js
            'three': path.resolve(__dirname, 'node_modules/three'),
            // Добавляем алиас для three-exports, чтобы везде использовался именно он
            'three-exports': path.resolve(__dirname, 'src/three-exports.js')
        },
        fallback: {
            "fs": false,
            "path": false,
        },
    },
    optimization: {
        // Предотвращаем дублирование модулей
        splitChunks: {
            chunks: 'all',
            // Особые настройки для three.js
            cacheGroups: {
                three: {
                    test: /[\\/]node_modules[\\/]three[\\/]/,
                    name: 'three', 
                    chunks: 'all',
                    enforce: true, // Явно указываем выделить three.js
                    priority: 10   // Высокий приоритет для three.js
                },
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'all',
                    priority: 1
                }
            }
        }
    },
    cache: false,
};