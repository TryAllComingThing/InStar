import test from 'node:test';import assert from 'node:assert/strict';import {listOrders} from '../src/orders/index.mjs';test('default limit',()=>assert.equal(listOrders({}).limit,20));
