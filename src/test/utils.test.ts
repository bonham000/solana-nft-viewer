import {
  abbreviateAddress,
  assertUnreachable,
  formatDate,
  formatFiatPrice,
  formatNumber,
  lamportsToSOL,
  isAddressValidPublicKey,
} from "../tools/utils";
import BN from "bignumber.js";

describe("utils tests", () => {
  test("assertUnreachable", () => {
    expect(() => assertUnreachable("hi" as never)).toThrow();
  });

  test("formatDate", () => {
    const date = 1640925203000;
    const result = formatDate(date);

    // Exact date will be different depending on timezone
    expect(typeof result).toBe("string");
  });

  test("formatFiatPrice", () => {
    const result = formatFiatPrice(new BN(2.3234), new BN(97.82));
    expect(result).toMatchInlineSnapshot(`"$227.27 USD"`);
  });

  test("formatNumber", () => {
    expect(formatNumber(new BN(827342.123))).toBe("827,342.12");
  });

  test("lamportsToSOL", () => {
    expect(lamportsToSOL(new BN(1487200000)).toString()).toBe("1.4872");
  });

  test("validateAddressAsPublicKey", () => {
    expect(isAddressValidPublicKey("sad8f07as0df")).toBe(false);
    expect(
      isAddressValidPublicKey("CmUFv7vaErzGknimoJyMvv6Fmhn3q4bHLK7fJWdW6m3p"),
    ).toBe(true);
  });

  test("abbreviateAddress", () => {
    expect(
      abbreviateAddress("CmUFv7vaErzGknimoJyMvv6Fmhn3q4bHLK7fJWdW6m3p"),
    ).toBe("CmUF...6m3p");
  });
});
