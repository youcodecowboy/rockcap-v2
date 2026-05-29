import { describe, it, expect } from "vitest";
import { matchPersonToContact } from "../lib/prospects/matchPersonToContact";

const contacts = [
  { _id: "c1", name: "Peter Mackenzie (175)", email: "pete.mackenzie@mm-homes.co.uk" },
  { _id: "c2", name: "Adam Renn Renn", email: "adam.renn@mm-homes.co.uk" },
  { _id: "c3", name: "Nicola Elia Renée Kinnie", email: "nicola.kinnie@mm-homes.co.uk" },
];

describe("matchPersonToContact", () => {
  it("matches Pete→Peter (prefix), strips (175)", () => {
    expect(matchPersonToContact("Pete Mackenzie", contacts)?._id).toBe("c1");
  });
  it("matches a doubled surname", () => {
    expect(matchPersonToContact("Adam Renn", contacts)?._id).toBe("c2");
  });
  it("matches across middle names + diacritics", () => {
    expect(matchPersonToContact("Nicola Kinnie", contacts)?._id).toBe("c3");
  });
  it("returns null when no contact matches", () => {
    expect(matchPersonToContact("George Mackenzie", contacts)).toBeNull(); // diff first name
    expect(matchPersonToContact("Bob Smith", contacts)).toBeNull();
  });
});
