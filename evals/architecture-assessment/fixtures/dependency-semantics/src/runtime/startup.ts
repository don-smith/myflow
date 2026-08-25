import { AnalyticsProjector } from "../analytics/analytics-projector.js";
import { Scheduler } from "../scheduling/scheduler.js";
import { EventBus } from "./event-bus.js";
import { OrderRuntime } from "./order-runtime.js";

const bus = new EventBus();
const scheduler = new Scheduler();
const analytics = new AnalyticsProjector(scheduler);
bus.subscribe((event) => analytics.record(event));
bus.subscribe((event) => scheduler.schedule(event));

export const orders = new OrderRuntime(bus);
