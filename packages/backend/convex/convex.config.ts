import actionRetrier from "@convex-dev/action-retrier/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(migrations);
app.use(actionRetrier);
export default app;
