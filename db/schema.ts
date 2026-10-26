import {sqliteTable,text,integer,uniqueIndex,index} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
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
export const customerProfiles=sqliteTable('customer_profiles',{userId:text('user_id').primaryKey(),name:text('name').notNull(),email:text('email').notNull(),phone:text('phone').notNull(),createdAt:text('created_at').notNull()});
export const supportMessages=sqliteTable('support_messages',{id:text('id').primaryKey(),userId:text('user_id').notNull(),role:text('role').notNull(),body:text('body').notNull(),createdAt:text('created_at').notNull()},table=>[index('messages_user_date').on(table.userId,table.createdAt)]);
export const virtualBookings=sqliteTable('virtual_bookings',{id:text('id').primaryKey(),userId:text('user_id').notNull(),date:text('date').notNull(),time:text('time').notNull(),notes:text('notes').notNull(),status:text('status').notNull(),meetingUrl:text('meeting_url').notNull(),createdAt:text('created_at').notNull()},table=>[uniqueIndex('confirmed_session_slot').on(table.date,table.time).where(sql`${table.status} = 'confirmed'`)]);
export const storeActivity=sqliteTable('store_activity',{id:text('id').primaryKey(),userId:text('user_id').notNull(),kind:text('kind').notNull(),detail:text('detail').notNull(),createdAt:text('created_at').notNull()});
export const orderFulfilment=sqliteTable('order_fulfilment',{orderId:text('order_id').primaryKey(),status:text('status').notNull(),tracking:text('tracking').notNull(),updatedAt:text('updated_at').notNull()});
