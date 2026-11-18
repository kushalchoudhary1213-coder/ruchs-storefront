import {integer, primaryKey, sqliteTable, text} from 'drizzle-orm/sqlite-core';

export const tryonQuota = sqliteTable('tryon_quota', {
  day: text('day').notNull(),
  scope: text('scope').notNull(),
  subject: text('subject').notNull(),
  count: integer('count').notNull().default(0),
}, table => [primaryKey({columns: [table.day, table.scope, table.subject]})]);
