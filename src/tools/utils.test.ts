import { formatDate, formatFiatPrice } from "./utils";

describe("utils tests", () => {
  test("formatDate", () => {
    const date = 1640925203000;
    const result = formatDate(date);

    // Exact date will be different depending on timezone
    expect(typeof result).toBe("string");
  });

  test("formatFiatPrice", () => {
    const price = 50;
    const result = formatFiatPrice(price);
    expect(result).toMatchInlineSnapshot(`"$250.00 USD"`);
  });
});
