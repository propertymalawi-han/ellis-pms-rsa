export const statementStatuses = ["expected", "received"] as const;

export type StatementStatus = (typeof statementStatuses)[number];

export const statementStatusLabels: Record<StatementStatus, string> = {
  expected: "Expected",
  received: "Received",
};

export function isStatementStatus(value: string): value is StatementStatus {
  return (statementStatuses as readonly string[]).includes(value);
}

export const STATEMENTS_BUCKET = "statements";

export const MAX_STATEMENT_BYTES = 20 * 1024 * 1024;

export const SIGNED_URL_SECONDS = 10 * 60;
