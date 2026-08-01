export type AuthUser = {
  id: number;
  username: string;
  role: number;
  permissions: string[];
  /** UNIX seconds. Preserves one login session's absolute seven-day lifetime. */
  sessionStartedAt?: number;
  /** UNIX seconds. Renewed only while the user is active. */
  lastActivityAt?: number;
};
