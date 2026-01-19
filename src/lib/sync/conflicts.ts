// Last-write-wins conflict resolution strategy
// Compares updated_at timestamps to determine winner

export interface Timestamped {
  updated_at: string;
}

export function isRemoteNewer<T extends Timestamped>(local: T, remote: T): boolean {
  return new Date(remote.updated_at) > new Date(local.updated_at);
}

export function isLocalNewer<T extends Timestamped>(local: T, remote: T): boolean {
  return new Date(local.updated_at) > new Date(remote.updated_at);
}

// Merge strategy: remote wins on newer timestamp, otherwise local wins
export function resolveConflict<T extends Timestamped>(local: T, remote: T): T {
  return isRemoteNewer(local, remote) ? remote : local;
}
