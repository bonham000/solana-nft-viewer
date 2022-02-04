import { assertUnreachable } from "./utils";

/**
 * This is a Result type loosely inspired by the Rust Result enum. Here,
 * it's specifically designed to model asynchronously fetched data which
 * can exist in one of three states: Loading | Error | Ok
 *
 * The types and helper functions below allow one to define Result objects
 * which must exist in one of the three states.
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E }
  | { ok: false; loading: true };

export const Ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

export const Err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

export const ResultLoading = (): Result<never, never> => ({
  ok: false,
  loading: true,
});

export interface ResultMatcher<T, E, R1, R2, R3> {
  ok: (value: T) => R1;
  err: (error: E) => R2;
  loading: () => R3;
}

/**
 * Match-like statement for a Result which mimics the match statement semantics
 * in Rust. Each potential variant (loading, error, ok) must be handled
 * when using this.
 */
export const matchResult = <T, E, R1, R2, R3>(
  x: Result<T, E>,
  matcher: ResultMatcher<T, E, R1, R2, R3>,
) => {
  if ("loading" in x) {
    // Loading State
    return matcher.loading();
  } else if ("error" in x) {
    // Error State
    return matcher.err(x.error);
  } else if (x.ok === true) {
    // Ok State
    return matcher.ok(x.value);
  } else {
    // No other possible states exist
    return assertUnreachable(x);
  }
};
