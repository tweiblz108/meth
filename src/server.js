#!/usr/bin/env node
const AnyProxy = require("anyproxy");
const path = require('path')
const R = require("ramda");
const fs = require("fs");

const RAT_SCRIPT_URL = "https://rat.rat/rat.js";

const rule = {
  summary: "抓微信公众号文章",
  *beforeSendRequest(requestDetail) {
    const url = requestDetail.url;

    if (url === RAT_SCRIPT_URL) {
      // 拦截注入脚本请求，返回脚本内容
      const injectScript = fs.readFileSync(path.resolve(__dirname, "./rat.bundle.js"));

      return {
        response: {
          statusCode: 200,
          header: {
            "Content-Type": "application/javascript"
          },
          body: injectScript
        }
      };
    } else {
      const hostname = requestDetail.requestOptions.hostname
      // 所有对  https://rat.rat/ 的请求全部重定向到 ratServer
      if (hostname === "rat.rat") {
        requestDetail.protocol = 'http'
        
        requestDetail.requestOptions.hostname = 'localhost'
        requestDetail.requestOptions.port = '1337'

        return requestDetail
      } else if (hostname === 'next.job') {
        requestDetail.protocol = 'http'
        
        requestDetail.requestOptions.hostname = '127.0.0.1'
        requestDetail.requestOptions.port = 5673

        return requestDetail
      } else if (hostname === 'badjs.weixinbridge.com') {
        // 这貌似是微信报告异常事件的请求，处理一下也许可以降低被封号的可能
        return {
          response: {
            statusCode: 200,
            header: {
              "Content-Type": "text/html"
            },
            body: 'SHUT THE FUCK UP!'
          }
        };
      } else {
        return null
      }
    }
  },

  *beforeSendResponse(requestDetail, responseDetail) {
    const url = requestDetail.url;

    // 在进入公众号历史消息页时处理
    if (/mp\/profile_ext\?action=home/i.test(url)) {
      const response = R.clone(responseDetail.response);

      // 注入脚本
      response.body += `<script defer type="text/javascript" src="${RAT_SCRIPT_URL}" ></script>\n`;

      // 启用微信自带的调试窗口 vConsole
      // response.header["Set-Cookie"] && response.header["Set-Cookie"].push("vconsole_open=1; Path=/;");

      return {
        response
      };
    } else {
      return null;
    }
  }
};


const options = {
  port: 4001,
  rule,
  forceProxyHttps: true,
  dangerouslyIgnoreUnauthorized: true
};

// @ts-ignore
const proxyServer = new AnyProxy.ProxyServer(options);

proxyServer.on("ready", () => {
  console.log("OK, proxy server run on http://localhost:4001");
});

proxyServer.start();
