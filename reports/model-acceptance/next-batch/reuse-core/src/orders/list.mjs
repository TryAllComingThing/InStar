import {request} from '../network/index.mjs';
export const listOrders=transport=>request('/orders',transport);
