// src/setupProxy.js
// 注意：新版http-proxy-middleware需要解构createProxyMiddleware
const { createProxyMiddleware } = require('http-proxy-middleware');

// 导出代理配置函数
module.exports = function(app) {
  // 配置API代理到后端服务器
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
      // 对于流媒体请求，不要缓冲响应
      onProxyReq: (proxyReq, req, res) => {
        // 禁用缓冲，允许流式传输
        if (req.url.includes('/stream/')) {
          proxyReq.setHeader('Connection', 'keep-alive');
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        // 对于流媒体响应，设置正确的headers
        if (req.url.includes('/stream/')) {
          proxyRes.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
          proxyRes.headers['Pragma'] = 'no-cache';
          proxyRes.headers['Expires'] = '0';
        }
      },
      // 日志配置
      logLevel: 'debug',
    })
  );
};
