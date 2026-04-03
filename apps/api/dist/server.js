import cors from "@fastify/cors";
import Fastify from "fastify";
import { config } from "./core/config.js";
import { registerSessionRoutes } from "./routes/session.js";
const app = Fastify({ logger: true });
await app.register(cors, {
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
});
app.get("/health", async () => ({
    ok: true,
    service: "poker-api",
}));
await registerSessionRoutes(app);
try {
    await app.listen({ port: config.port, host: config.host });
}
catch (error) {
    app.log.error(error);
    process.exit(1);
}
