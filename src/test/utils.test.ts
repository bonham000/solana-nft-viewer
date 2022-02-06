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

    // NOTE: Exact date will be different depending on local timezone
    expect(typeof result).toBe("string");
  });

  test("formatFiatPrice", () => {
    const result = formatFiatPrice(new BN(2.3234), new BN(97.82));
    expect(result).toMatchInlineSnapshot(`"$227.27 USD"`);
  });

  test("formatNumber", () => {
    expect(formatNumber(new BN(0))).toBe("0.00");
    expect(formatNumber(new BN(5.12))).toBe("5.12");
    expect(formatNumber(new BN(5000))).toBe("5,000.00");
    expect(formatNumber(new BN(827342.123))).toBe("827,342.12");
    expect(formatNumber(new BN(1927309127323))).toBe("1,927,309,127,323.00");
  });

  test("lamportsToSOL", () => {
    expect(lamportsToSOL(new BN(0)).toString()).toBe("0");
    expect(lamportsToSOL(new BN(5000)).toString()).toBe("0.000005");
    expect(lamportsToSOL(new BN(3824)).toString()).toBe("0.000003824");
    expect(lamportsToSOL(new BN(1487200000)).toString()).toBe("1.4872");
    expect(lamportsToSOL(new BN(982745100000)).toString()).toBe("982.7451");
  });

  test("validateAddressAsPublicKey", () => {
    // Invalid
    expect(isAddressValidPublicKey("")).toBe(false);
    expect(
      isAddressValidPublicKey(
        "5KSpPazKeay8nWukmXgBPK2TwJBpNvqjvjxZb83Jq3ZoJBHJh9ZC2hXEh59MERCVdaaFWWFFe8UDC14xHuSFaA5t",
      ),
    ).toBe(false);
    expect(isAddressValidPublicKey("sad8f07as0df")).toBe(false);

    // Valid
    expect(
      isAddressValidPublicKey("CmUFv7vaErzGknimoJyMvv6Fmhn3q4bHLK7fJWdW6m3p"),
    ).toBe(true);
    expect(
      isAddressValidPublicKey("EoTbt857oar8JLU5NwduEHVqmFWgc5yiBt1g43YWJCN2"),
    ).toBe(true);
    expect(
      isAddressValidPublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    ).toBe(true);
  });

  test("abbreviateAddress", () => {
    expect(
      abbreviateAddress("CmUFv7vaErzGknimoJyMvv6Fmhn3q4bHLK7fJWdW6m3p"),
    ).toBe("CmUF...6m3p");
  });
});
