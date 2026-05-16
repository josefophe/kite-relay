import express from "express";
import client from "prom-client";
import { logger } from "./logger";

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: "kite_relay_" });

export const requestCounter = new client.Counter({
  name: "kite_relay_requests_total",
  help: "Total number of Telegram bot executions",
  labelNames: ["command", "status"] as const,
});

export const executionDuration = new client.Histogram({
  name: "kite_relay_execution_duration_seconds",
  help: "Execution time for user runtime operations",
  labelNames: ["command"] as const,
  buckets: [0.1, 0.5, 1, 3, 10, 30],
});

export function recordCommand(command: string, success: boolean, durationSeconds: number): void {
  requestCounter.labels(command, success ? "success" : "failure").inc();
  executionDuration.labels(command).observe(durationSeconds);
}

export function setupMetrics(app: express.Express): void {
  app.get("/metrics", async (req, res) => {
    try {
      res.set("Content-Type", client.register.contentType);
      res.end(await client.register.metrics());
    } catch (error) {
      logger.error({ error }, "failed to render metrics");
      res.status(500).send("metrics error");
    }
  });
  app.get("/health", (req, res) => res.status(200).json({ status: "ok", uptime: process.uptime() }));
}
