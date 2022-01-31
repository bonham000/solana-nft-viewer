import { formatDate, formatFiatPrice } from "./utils";

describe("utils tests", () => {
  test("formatDate", () => {
    const date = 1640925203000;
    const result = formatDate(date);
    expect(result).toMatchInlineSnapshot(`"Dec 30, 2021 at 10:33pm"`);
  });

  test("formatFiatPrice", () => {
    const price = 50;
    const result = formatFiatPrice(price);
    expect(result).toMatchInlineSnapshot(`"$250.00 USD"`);
  });
});
