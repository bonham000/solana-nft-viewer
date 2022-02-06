import { Ok, Err, matchResult, ResultLoading } from "../tools/result";

describe("Result Type", () => {
  const panic = () => {
    throw new Error(
      "matchResult matched a variant which should not be possible",
    );
  };

  test("matchResult ok variant", () => {
    const expected = {
      flag: true,
      data: [1, 2, 3, 4, 5],
      description: "This is the data...",
    };

    const result = matchResult(Ok(expected), {
      ok: (x) => x,
      err: panic,
      loading: panic,
    });

    expect(result).toEqual(expected);
  });

  test("matchResult err variant", () => {
    const expected = "Error Variant";
    const result = matchResult(Err(expected), {
      ok: panic,
      err: (e) => e,
      loading: panic,
    });

    expect(result).toBe(expected);
  });

  test("matchResult loading variant", () => {
    const expected = "Loading Variant";
    const result = matchResult(ResultLoading(), {
      ok: panic,
      err: panic,
      loading: () => expected,
    });

    expect(result).toBe(expected);
  });
});
