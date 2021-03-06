export class Failure {
  code: number
  constructor(code: number) {
    this.code = code
  }
}

class Catcher<T, E> {
  private predicate: () => T

  constructor(predicate: () => T) {
    this.predicate = predicate
  }

  unwrap(): T {
    return this.predicate()
  }

  /**
   * Retrieves the data returned by the predicate, on error ends the program.
   * @param errHandler argument `err` is the exception thrown by the predicate;
   * the return value of this handler should be a valid value for use if you want the program to resume,
   * or `null` (`IGNORE`) if you want peaceful shutdown, or `undefined` (`RETHROW`) if you want to rethrow the error,
   * or `FAIL_EXIT(code)` if you want to exit the program with an error code.
   */
  unwrapOr(errHandler: (err: E) => T | Failure | null | undefined): T {
    try {
      return this.predicate()
    } catch (e) {
      const resume = errHandler(e)
      if (resume === undefined) {
        throw e
      } else if (resume === null) {
        process.exit(0)
      } else if (resume instanceof Failure) {
        process.exit(resume.code)
      } else {
        return resume
      }
    }
  }
}

export function Try<T, E>(predicate: () => T): Catcher<T, E> {
  return new Catcher<T, E>(predicate)
}

export const RETHROW = undefined
export const IGNORE = null
export function FAIL_EXIT(code: number) {
  return new Failure(code)
}
