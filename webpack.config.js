const path = require('path');
const webpack = require("webpack");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development',
    entry: {
        main: path.join(__dirname, 'src/main')
    },
    output: {
        filename: '[name].[contenthash].bundle.js',
        path: path.join(__dirname, 'dist'),
        clean: true
    },
    devtool: 'source-map',
    resolve: {
        extensions: ['.js', '.ts']
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/
            },
            {
                test: /\.tsx?$/,
                loader: 'ts-loader'
            },
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.(wgsl|glsl|vs|fs)$/,
                loader: 'ts-shader-loader'
            },
            {
                test: /\.(png|lzma|woff2|jpg)$/i,
                type: 'asset/resource'
            }
        ]
    },
    plugins: [
        new webpack.ProvidePlugin({
            $: 'jquery'
        }),
        new HtmlWebpackPlugin({
            filename: 'index.html',
            template: 'src/index.html',
        }),
        new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'src/assets',
                        to: 'assets'
                    }
                ]
            }
        )
    ]
};
