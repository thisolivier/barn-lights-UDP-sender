import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'dgram';
import { UdpSender } from '../src/udp-sender/index.mjs';
import { Mailbox } from '../src/mailbox/index.mjs';

test('sendRebootSignal sends a byte to port base plus one hundred', async () => {
  const udpServer = dgram.createSocket('udp4');
  await new Promise((resolve) => udpServer.bind(0, resolve));
  const rebootPort = udpServer.address().port;
  const portBase = rebootPort - 100;
  const runtimeConfig = {
    sides: {
      left: { ip: '127.0.0.1', portBase, runs: [] },
    },
  };
  const mailbox = new Mailbox();
  const sender = new UdpSender(runtimeConfig, mailbox);
  sender.start();
  const received = new Promise((resolve) => {
    udpServer.once('message', (msg) => resolve(msg));
  });
  sender.sendRebootSignal('left');
  const message = await received;
  assert.strictEqual(message.length, 1);
  sender.stop();
  udpServer.close();
});

test('packets prefix RGB data with session and frame identifiers', async () => {
  const udpServer = dgram.createSocket('udp4');
  await new Promise((resolve) => udpServer.bind(0, resolve));
  const runPort = udpServer.address().port;
  const runtimeConfig = {
    sides: {
      left: {
        ip: '127.0.0.1',
        portBase: runPort,
        runs: [{ run_index: 0, led_count: 1 }],
      },
    },
  };
  const mailbox = new Mailbox();
  const sender = new UdpSender(runtimeConfig, mailbox);

  const payloadPromise = new Promise((resolve) => {
    udpServer.once('message', (msg) => resolve(msg));
  });

  const frame = {
    frame_id: 123,
    runs: [{ run_index: 0, data: Buffer.from([1, 2, 3]) }],
  };
  mailbox.write('left', frame);
  sender.start();

  const message = await payloadPromise;
  assert.strictEqual(message.length, 6 + frame.runs[0].data.length);
  assert.strictEqual(message.readUInt16BE(0), sender.sessionId);
  assert.strictEqual(message.readUInt32BE(2), frame.frame_id);
  assert.deepStrictEqual(message.subarray(6), frame.runs[0].data);

  sender.stop();
  udpServer.close();
});
