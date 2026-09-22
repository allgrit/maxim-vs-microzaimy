import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_KEYS } from '../src/input.js';

test('каждое действие тач-кнопки принимается по своему имени (баг рывка на телефоне)', () => {
  for (const action of ['dash', 'refuse', 'ult', 'pause']) {
    assert.ok(ACTION_KEYS[action].includes(action), `действие ${action} не принимает своё имя`);
  }
});
