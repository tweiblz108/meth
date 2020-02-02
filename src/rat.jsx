import "core-js";
import "regenerator-runtime/runtime";

import * as R from "ramda";
import axios from "axios";
import { decode } from "entities";
import React, { Fragment } from "react";
import ReactDOM from "react-dom";
import Parse from "parse";

import config from "../general-config";

Parse.initialize(config.appId);
Parse.serverURL = "https://rat.rat/parse";

/** 公众号 */
const Account = Parse.Object.extend("Account");

/** 文章 */
const Article = Parse.Object.extend("Article");

/** 内容 */
const Content = Parse.Object.extend("Content");

/** Parse Object 直接赋值对象 */
const set = (parseObj, obj) => {
  R.toPairs(obj).forEach(([name, value]) => parseObj.set(name, value));
};

/** 延时函数 */
const sleep = sec =>
  new Promise(resolve =>
    setTimeout(() => {
      resolve();
    }, sec * 1000)
  );

/** 由 url 分析每篇文章的唯一标识 sn */
const sn = content_url => {
  const content$url = decode(content_url);
  const url = new URL(content$url);
  const sn = url.searchParams.get("sn");

  return sn;
};

/** 转换 content_url */
const contentURL = content_url => {
  //  原始协议为 http: 需要否则无法在公众号网页内请求（不允许混合内容）
  return decode(content_url).replace(/^http/, "https");
};

class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = { logs: [] };
  }

  /** 处理文章目录列表 */
  processMessageList(messageList) {
    const messages = [];

    // 参考 data/msgList.json
    for (const message of messageList) {
      const {
        comm_msg_info: { datetime },
        app_msg_ext_info
      } = message;

      const publishedAt = new Date(datetime * 1000); // 文章发布时间，原始数据以 秒 计

      // 特定种类的消息 app_msg_ext_info 可能为 undefined
      if (!R.isNil(app_msg_ext_info)) {
        const {
          title, // 文章标题
          digest, // 摘要
          content_url, // 内容 url，使用 entities 编码过，需要处理
          cover, // 封面图片
          author, // 单篇文章的作者
          is_multi // 消息中是否包含多个文章
        } = app_msg_ext_info;

        // content_url 可能为空，遇到过此类数据
        if (!R.isEmpty(content_url)) {
          messages.push({
            sn: sn(content_url),
            author,
            title: decode(title),
            cover,
            digest: decode(digest),
            publishedAt,
            content_url: contentURL(content_url)
          });
        }

        if (is_multi === 1) {
          // 这个结构中包含额外的文章
          const { multi_app_msg_item_list } = app_msg_ext_info;

          for (const msg of multi_app_msg_item_list) {
            const { title, digest, content_url, cover, author } = msg;

            // content_url 可能为空
            if (!R.isEmpty(content_url)) {
              messages.push({
                sn: sn(content_url),
                author,
                title: decode(title),
                cover,
                digest: decode(digest),
                publishedAt,
                content_url: contentURL(content_url)
              });
            }
          }
        }
      }
    }

    return messages;
  }

  log(log, overlap = false) {
    if (overlap) {
      // 替换最后一项输出
      this.setState({ logs: R.append(log, R.dropLast(1, this.state.logs)) });
    } else {
      this.setState({ logs: R.append(log, this.state.logs) });
    }
  }

  componentDidMount() {
    try {
      (async () => {
        const visitedDateTime = new Date();
        this.log("!!! Mr.Rat Had Take Position!!!");
        this.log(visitedDateTime.toString());

        // 报告公众号信息
        const {
          __biz: biz, // 公众号 __biz
          headimg, // 公众号头像
          nickname, // 公众号名称
          username // 公众号原始 ID
        } = window;

        // 公众号描述
        const profile_desc = document.querySelector("p.profile_desc").innerText;

        const account = R.defaultTo(
          new Account(),
          await new Parse.Query(Account).equalTo("biz", biz).first()
        );

        set(account, {
          biz,
          headimg,
          nickname,
          username,
          profile_desc,
          takeAll: R.defaultTo(false, account.get("takeAll"))
        });

        this.log(`处理公众号 ${nickname} ${biz}`);

        await account.save();

        const takeNums = 100;
        let takeCount = 0;
        const takeAll = R.defaultTo(false, account.get("takeAll")); // 爬取全部 或 只爬取 100 篇
        const visitedAt = R.defaultTo(new Date(0), account.get("visitedAt"));

        // 处理首页数据
        // 首页数据需要经过 html实体解码
        const messages = this.processMessageList(
          JSON.parse(decode(window.msgList))["list"]
        );

        await this.saveArticles(messages);
        takeCount += messages.length;

        const pass = R.any(
          ({ publishedAt }) => publishedAt < visitedAt,
          messages
        );

        this.log(
          `首页数据处理完毕，获得文章 ${messages.length} 篇，总数 ${takeCount}`
        );

        if (!pass) {
          // 处理后续文章
          let nextOffset = window.next_offset;
          let canMsgContinue = window.can_msg_continue;

          while (canMsgContinue === 1 && (takeAll || takeCount <= takeNums)) {
            const delay = 2;
            this.log(`等待 ${delay} 秒，数据分页，起始位置 ${nextOffset}`);
            await sleep(delay);

            const getmsgURL = new URL(location.href); // https://mp.weixin.qq.com/mp/profile_ext?action=home....
            const searchParams = new URLSearchParams();

            searchParams.set("action", "getmsg");
            searchParams.set("__biz", biz);
            searchParams.set("f", "json");
            searchParams.set("offset", nextOffset);
            searchParams.set("count", "10");
            searchParams.set("is_ok", window.is_ok);
            searchParams.set("scene", window.scene);
            searchParams.set("uin", window.uin);
            searchParams.set("key", window.key);
            searchParams.set("pass_ticket", window.pass_ticket);
            searchParams.set("wxtoken", window.wxtoken);
            searchParams.set("appmsg_token", window.appmsg_token);
            searchParams.set("x5", "0");

            // 拼接处 getmsg 的请求
            getmsgURL.search = searchParams.toString();

            const { data } = await axios.get(getmsgURL.toString());

            const messages = this.processMessageList(
              JSON.parse(data.general_msg_list)["list"]
            );
            await this.saveArticles(messages);
            this.log(
              `已处理分页数据 ${nextOffset} - ${data.next_offset}，获得文章总数 ${messages.length}，总数 ${takeCount}`,
              true
            );

            canMsgContinue = data.can_msg_continue;
            nextOffset = data.next_offset;

            // 若文章发布时间小于上次访问时间，则停止，因为文章的更新是顺序的
            if (R.any(({ publishedAt }) => publishedAt < visitedAt, messages)) {
              break;
            } else {
              takeCount += messages.length;
            }
          }
        }

        this.log(`所有新文章枚举完毕， 处理文章总数 ${takeCount}`);

        // 设置最后一次处理时间
        account.set("visitedAt", visitedDateTime);
        // 设置使用的微信号
        account.set("uin", window.uin);
        await account.save();

        this.getNextJob();
      })();
    } catch (e) {
      window.location.reload();
    }
  }

  async getNextJob() {
    try {
      this.log(`获取下一个公众号。。。`);

      const { data: biz } = await axios.get("https://next.job/");

      this.log(`即将开始处理下一个公众号 ${biz}`);

      setTimeout(() => {
        window.location.href = `https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=${biz}&scene=124&#wechat_redirect`;
      }, 2000);
    } catch (e) {
      console.error(e);
    }
  }

  async saveArticles(messages) {
    const { __biz: biz } = window;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      const _article = await new Parse.Query(Article)
        .equalTo("sn", message.sn)
        .first();

      if (R.isNil(_article)) {
        const article = new Article();
        set(article, R.mergeRight(message, { biz }));
        await article.save();

        this.log(`[${i + 1}/${messages.length}] [存储] ${message.title}`);
      } else {
        this.log(`[${i + 1}/${messages.length}] [跳过] ${message.title}`);
      }
    }
  }

  componentDidUpdate() {
    // log 函数输出后自动滚动到叶底
    const elem = document.getElementById("rat-console");

    if (elem) {
      elem.lastElementChild.scrollIntoView();
    }
  }

  render() {
    const { logs } = this.state;

    return (
      <Fragment>
        <div
          id="rat-console"
          style={{
            position: "fixed",
            zIndex: 100000,
            top: 0,
            right: 0,
            width: "600px",
            paddingLeft: "10px",
            height: "300px",
            textAlign: "center",
            background: "#337ab7",
            opacity: "0.8",
            overflowY: "scroll"
          }}
        >
          {logs.map((log, i) => (
            <div
              key={i}
              style={{
                textAlign: "left",
                color: "white",
                fontWeight: "normal",
                marginBottom: "10px"
              }}
            >
              {log}
            </div>
          ))}
        </div>
      </Fragment>
    );
  }
}

// 在微信内跳转下一个公众号，userAgent 会越来越长，这里修复了这个问题
navigator.__defineGetter__(
  "userAgent",
  () =>
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/605.1.15 (KHTML, like Gecko) MicroMessenger/2.3.27(0x12031b12) MacWechat Chrome/39.0.2171.95 Safari/537.36 NetType/WIFI WindowsWechat"
);

const elem = document.createElement("div");
document.body.appendChild(elem);

ReactDOM.render(<App />, elem);
