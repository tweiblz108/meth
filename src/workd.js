const Koa = require("koa");
const cors = require('@koa/cors')
const amqp = require("amqplib");

const MiddleMan = (() => {
  const messages = [];

  return {
    give(message, ack) {
      messages.push({
        message,
        ack
      });
    },

    get() {
      return new Promise(resolve => {
        const intervalId = setInterval(() => {
          if (messages.length) {
            const { message, ack } = messages.pop();
            ack();
            clearInterval(intervalId)
  
            resolve(message);
          }
        }, 1000);
      });
    }
  };
})();

const main = async () => {
  const QUEUE_NAME = "accounts";

  const connect = await amqp.connect("amqp://localhost");
  const channel = await connect.createChannel();

  await channel.assertQueue(QUEUE_NAME, { durable: false });
  await channel.prefetch(2)

  channel.consume(
    QUEUE_NAME,
    msg => {
      if (msg) {
        MiddleMan.give(msg, () => { channel.ack(msg) });
      }
    },
    { noAck: false }
  );

  const app = new Koa();

  app.use(cors())
  app.use(async ctx => {
    const message = await MiddleMan.get()
    console.log(message)
    ctx.body = message.content.toString()
  });

  app.listen(5673);

  console.log("😈 start at 5673")
};

module.exports = main
