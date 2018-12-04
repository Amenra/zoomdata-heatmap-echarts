module.exports = {
    output: {
        filename: 'visualization.js',
        path: __dirname
    },
    mode: 'production',
    module: {
        rules: [
            {
                test: /(\.js|\.jsx)?$/,
                exclude: /node_modules/,
                loader: 'babel-loader'
            },
            {
                test: /\.css$/,
                use: [
                    'style-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            modules: true
                        }
                    }
                ]
            }
        ]
    }
};
