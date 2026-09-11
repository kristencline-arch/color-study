import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const photoReports = sqliteTable("photo_reports", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  photoId: text("photo_id").notNull(),
  photoType: text("photo_type").notNull(),
  reason: text("reason").notNull(),
  details: text("details").notNull(),
  status: text("status").notNull().default("open"),
}, table => [index("photo_reports_status").on(table.status, table.createdAt, table.id)]);

export const catalogReleases = sqliteTable("catalog_releases", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
});

export const catalogPhotos = sqliteTable("catalog_photos", {
  releaseId: text("release_id").notNull(),
  id: text("id").notNull(),
  category: text("category").notNull(),
  region: text("region").notNull(),
  provider: text("provider").notNull(),
  yearStart: integer("year_start"),
  yearEnd: integer("year_end"),
  searchText: text("search_text").notNull(),
  sortOrder: integer("sort_order").notNull(),
  dataJson: text("data_json").notNull(),
}, table => [
  primaryKey({columns: [table.releaseId, table.id]}),
  index("catalog_photos_browse").on(table.releaseId, table.category, table.sortOrder),
]);
