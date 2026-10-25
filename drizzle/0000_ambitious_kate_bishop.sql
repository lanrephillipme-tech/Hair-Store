CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `test_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`checkout_key` text NOT NULL,
	`cart` text NOT NULL,
	`total` integer NOT NULL,
	`currency` text NOT NULL,
	`delivery` text NOT NULL,
	`country` text NOT NULL,
	`session_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `test_orders_checkout_key_unique` ON `test_orders` (`checkout_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `test_orders_session_id_unique` ON `test_orders` (`session_id`);