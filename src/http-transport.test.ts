import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_HOST, isAllowedHostHeader } from './transport/HttpTransport.js';

test('default bind host is loopback', () => {
  assert.equal(DEFAULT_HOST, '127.0.0.1');
});

test('loopback bind accepts loopback Host headers', () => {
  for (const host of ['127.0.0.1:3992', 'localhost:3992', 'LOCALHOST', '[::1]:3992']) {
    assert.equal(isAllowedHostHeader(host, '127.0.0.1'), true, host);
  }
});

test('loopback bind rejects other or missing Host headers', () => {
  for (const host of ['192.168.0.168:3992', 'evil.example:3992', 'localhost.evil.example', undefined]) {
    assert.equal(isAllowedHostHeader(host, '127.0.0.1'), false, String(host));
  }
});

test('non-loopback bind does not filter Host headers', () => {
  assert.equal(isAllowedHostHeader('evil.example', '0.0.0.0'), true);
});
