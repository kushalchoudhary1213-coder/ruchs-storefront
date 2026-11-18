CREATE TABLE `tryon_quota` (
	`day` text NOT NULL,
	`scope` text NOT NULL,
	`subject` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `scope`, `subject`)
);
