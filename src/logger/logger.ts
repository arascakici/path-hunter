/**
 * A tiny dependency-free structured logger.
 *
 * Two output formats: `pretty` (human-friendly, colorised on a TTY) for local
 * CLI use, and `json` (one JSON object per line) for log aggregation. Both the
 * clock and the output sink are injectable so the logger is trivially testable.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'pretty' | 'json';

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Returns a new logger that merges `bindings` into every log line. */
  child(bindings: LogContext): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  format?: LogFormat;
  color?: boolean;
  /** Overrides output. When set, every level is routed here (used in tests). */
  sink?: (line: string, level: LogLevel) => void;
  /** Injectable clock, defaults to `() => new Date()`. */
  now?: () => Date;
  bindings?: LogContext;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '90', // grey
  info: '36', // cyan
  warn: '33', // yellow
  error: '31', // red
};

function isLogLevel(value: string | undefined): value is LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error';
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  const level: LogLevel = options.level ?? (isLogLevel(envLevel) ? envLevel : 'info');
  const format: LogFormat = options.format ?? (process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty');
  const color =
    options.color ??
    (format === 'pretty' && Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
  const now = options.now ?? (() => new Date());
  const bindings = options.bindings ?? {};

  const threshold = LEVEL_PRIORITY[level];

  const write = (lineLevel: LogLevel, message: string, context?: LogContext): void => {
    if (LEVEL_PRIORITY[lineLevel] < threshold) return;

    const merged: LogContext = { ...bindings, ...context };
    const line =
      format === 'json'
        ? renderJson(now(), lineLevel, message, merged)
        : renderPretty(now(), lineLevel, message, merged, color);

    if (options.sink) {
      options.sink(line, lineLevel);
    } else if (lineLevel === 'warn' || lineLevel === 'error') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  };

  return {
    debug: (m, c) => write('debug', m, c),
    info: (m, c) => write('info', m, c),
    warn: (m, c) => write('warn', m, c),
    error: (m, c) => write('error', m, c),
    child: (childBindings) =>
      createLogger({ ...options, bindings: { ...bindings, ...childBindings } }),
  };
}

function renderJson(ts: Date, level: LogLevel, message: string, context: LogContext): string {
  const record: Record<string, unknown> = {
    ts: ts.toISOString(),
    level,
    msg: message,
  };
  for (const [key, value] of Object.entries(context)) {
    record[key] = value instanceof Error ? serializeError(value) : value;
  }
  return JSON.stringify(record);
}

function renderPretty(
  ts: Date,
  level: LogLevel,
  message: string,
  context: LogContext,
  color: boolean,
): string {
  const time = ts.toISOString().slice(11, 23); // HH:MM:SS.mmm
  const tag = level.toUpperCase().padEnd(5);
  const label = color ? `\x1b[${LEVEL_COLOR[level]}m${tag}\x1b[0m` : tag;
  const dim = (s: string) => (color ? `\x1b[90m${s}\x1b[0m` : s);

  const contextStr = formatContext(context);
  const suffix = contextStr ? ' ' + dim(contextStr) : '';
  return `${dim(time)} ${label} ${message}${suffix}`;
}

function formatContext(context: LogContext): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(context)) {
    parts.push(`${key}=${formatValue(value)}`);
  }
  return parts.join(' ');
}

function formatValue(value: unknown): string {
  if (value instanceof Error) return JSON.stringify(value.message);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return /[\s"]/.test(value) ? JSON.stringify(value) : value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function serializeError(error: Error): Record<string, unknown> {
  return { name: error.name, message: error.message, stack: error.stack };
}

/** A ready-to-use logger configured from the environment. */
export const logger = createLogger();
