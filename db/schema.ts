import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const communityPhotos = sqliteTable("community_photos", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  title: text("title").notNull(),
  location: text("location").notNull(),
  author: text("author").notNull(),
  description: text("description").notNull(),
  imageKey: text("image_key").notNull(),
  thumbnailKey: text("thumbnail_key").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  removalHash: text("removal_hash").notNull(),
  license: text("license").notNull().default("CC BY 4.0"),
}, table => [index("community_photos_created").on(table.createdAt, table.id)]);

export const communityLimits = sqliteTable("community_limits", {
  bucket: text("bucket").primaryKey(),
  used: integer("used").notNull(),
});
