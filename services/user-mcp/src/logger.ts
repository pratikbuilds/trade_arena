type LogLevel = "info" | "warn" | "error" | "debug";
type Meta = Record<string, unknown>;

function write(level: LogLevel, message: string, meta?: Meta): void {
  const entry = { ts: new Date().toISOString(), level, message, ...meta };
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  info: (message: string, meta?: Meta) => write("info", message, meta),
  warn: (message: string, meta?: Meta) => write("warn", message, meta),
  error: (message: string, meta?: Meta) => write("error", message, meta),
  debug: (message: string, meta?: Meta) => write("debug", message, meta),
};
