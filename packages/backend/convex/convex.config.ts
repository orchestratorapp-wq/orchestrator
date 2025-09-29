import actionRetrier from "@convex-dev/action-retrier/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(actionRetrier);
export default app;
