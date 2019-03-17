'use strict';

const test = require('ava');
const sedbot = require('../sedbot.js');

test('foo', t => {
  t.pass();
});

test('bar', async t => {
  const bar = Promise.resolve('bar');
  t.is(await bar, 'bar');
});

test('config-fail', t => {
  const error = t.throws(() => {
		new sedbot.Sedbot();
	}, TypeError);
	t.is(error.message, 'Cannot read property \'token\' of undefined');
});

test('config-success', t => {
  new sedbot.Sedbot({token: 'xoxb-xxxxyyyyzz-xxxxyyyyzzzz-xxxxyyyyzzzzxxxxyyyyzzzz',
    duckpercent: '4',
    kicktoken: 'xoxb-xxxxyyyyzz-xxxxyyyyzzzz-xxxxyyyyzzzzxxxxyyyyzzzz',
  });
  t.pass();
});