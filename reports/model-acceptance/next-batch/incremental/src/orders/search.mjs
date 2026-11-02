export const searchOrders=(orders,q)=>orders.filter(order=>order.name.includes(q));
