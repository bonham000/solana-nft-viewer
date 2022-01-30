import { identity } from "./tools/utils";

test("Placeholder test", () => {
  expect(identity(5)).toBe(5);
});
