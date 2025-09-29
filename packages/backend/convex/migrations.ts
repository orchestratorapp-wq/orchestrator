import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();

export const setDefaultValue = migrations.define({
	table: "projects",
	batchSize: 10,
	migrateOne: () => ({ isDefault: undefined }),
});

export const runAll = migrations.runner([internal.migrations.setDefaultValue]);
