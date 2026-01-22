/**
 * Dirty Fields Tracking Utility
 *
 * Tracks which fields in a form have been modified by the user.
 * Used by Save Button forms to implement field-level updates,
 * preventing local changes from overwriting server changes to
 * fields the user didn't modify.
 *
 * Usage:
 * ```typescript
 * const dirty = createDirtyTracker();
 *
 * // In form input handlers:
 * oninput={() => dirty.mark('name')}
 *
 * // On submit:
 * const updates = dirty.getChanges({ name, type, targetValue }, initialValues);
 * // Returns only the fields that were actually modified
 * ```
 */

export interface DirtyTracker {
  /** Mark a field as dirty (modified by user) */
  mark: (field: string) => void;
  /** Check if a field is dirty */
  isDirty: (field: string) => boolean;
  /** Check if any fields are dirty */
  hasChanges: () => boolean;
  /** Get all dirty field names */
  getDirtyFields: () => string[];
  /** Reset all dirty flags */
  reset: () => void;
  /**
   * Get only the changed values from a form data object.
   * Compares current values against initial values and returns
   * only fields that are both dirty AND have actually changed.
   */
  getChanges: <T extends Record<string, unknown>>(
    currentValues: T,
    initialValues: T
  ) => Partial<T>;
}

/**
 * Create a dirty field tracker for a form.
 */
export function createDirtyTracker(): DirtyTracker {
  const dirtyFields = new Set<string>();

  return {
    mark(field: string) {
      dirtyFields.add(field);
    },

    isDirty(field: string) {
      return dirtyFields.has(field);
    },

    hasChanges() {
      return dirtyFields.size > 0;
    },

    getDirtyFields() {
      return Array.from(dirtyFields);
    },

    reset() {
      dirtyFields.clear();
    },

    getChanges<T extends Record<string, unknown>>(
      currentValues: T,
      initialValues: T
    ): Partial<T> {
      const changes: Partial<T> = {};

      for (const field of dirtyFields) {
        if (field in currentValues) {
          const currentValue = currentValues[field];
          const initialValue = initialValues[field];

          // Only include if the value actually changed
          // Use JSON.stringify for deep comparison of objects/arrays
          const currentStr = JSON.stringify(currentValue);
          const initialStr = JSON.stringify(initialValue);

          if (currentStr !== initialStr) {
            changes[field as keyof T] = currentValue as T[keyof T];
          }
        }
      }

      return changes;
    }
  };
}

