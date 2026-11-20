import {integer, primaryKey, sqliteTable, text} from 'drizzle-orm/sqlite-core';

export const tryonQuota = sqliteTable('tryon_quota', {
  day: text('day').notNull(),
  scope: text('scope').notNull(),
  subject: text('subject').notNull(),
  count: integer('count').notNull().default(0),
}, table => [primaryKey({columns: [table.day, table.scope, table.subject]})]);

// Newsletter sign-ups from the site footer.
export const subscribers = sqliteTable('subscribers', {
  email: text('email').primaryKey(),
  source: text('source').notNull(),
  createdAt: text('created_at').notNull(),
});

// Messages sent from the contact page.
export const contactMessages = sqliteTable('contact_messages', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  orderNumber: text('order_number'),
  message: text('message').notNull(),
  createdAt: text('created_at').notNull(),
});
