import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const testOrders=sqliteTable('test_orders',{
  id:text('id').primaryKey(),
  tokenHash:text('token_hash').notNull(),
  checkoutKey:text('checkout_key').notNull().unique(),
  cart:text('cart').notNull(),
  total:integer('total').notNull(),
  currency:text('currency').notNull(),
  delivery:text('delivery').notNull(),
  country:text('country').notNull(),
  sessionId:text('session_id').unique(),
  status:text('status').notNull().default('pending'),
  createdAt:text('created_at').notNull()
});
export const paymentEvents=sqliteTable('payment_events',{
  id:text('id').primaryKey(),
  orderId:text('order_id').notNull(),
  createdAt:text('created_at').notNull()
});
