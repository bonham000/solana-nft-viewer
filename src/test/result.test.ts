import { Ok, Err, matchResult, ResultLoading } from "../tools/result";

describe("Result Type", () => {
  const throwError = () => {
    throw new Error("Should not happen!");
  };

  test("matchResult ok variant", () => {
    const SOME_DATA = {
      flag: true,
      data: [1, 2, 3, 4, 5],
      description: "This is the data...",
    };

    const result = matchResult(Ok(SOME_DATA), {
      ok: (x) => x,
      err: throwError,
      loading: throwError,
    });

    expect(result).toEqual(SOME_DATA);
  });

  test("matchResult err variant", () => {
    const errorString = "Error Variant";
    const result = matchResult(Err(errorString), {
      ok: throwError,
      err: (e) => e,
      loading: throwError,
    });

    expect(result).toBe(errorString);
  });

  test("matchResult loading variant", () => {
    const expected = "Loading Variant";
    const result = matchResult(ResultLoading(), {
      ok: throwError,
      err: throwError,
      loading: () => expected,
    });

    expect(result).toBe(expected);
  });
});
