import { describe, expect, it } from "vitest";
import {
  buildElectionSupportSchema,
  buildFaqSchema,
  buildServicesSchema,
} from "./structuredData.js";

describe("product-page structured data", () => {
  it("keeps the services schema aligned with the approved public offer", () => {
    const schema = buildServicesSchema();

    expect(schema["@type"]).toBe("Service");
    expect(schema.name).toBe("Data-led campaign management and consultancy");
    expect(schema.provider.name).toBe("Political Solutions");
    expect(schema.serviceType).toEqual([
      "Campaigning, Training & Election Support",
      "Constituency Intelligence",
      "Marked Register Processing",
    ]);
    expect(schema.description).not.toMatch(/UK-wide|subscription platform/i);
  });

  it("keeps the election-support schema free of unapproved coverage claims", () => {
    const schema = buildElectionSupportSchema();

    expect(schema["@type"]).toBe("Service");
    expect(schema.provider.name).toBe("Political Solutions");
    expect(schema.serviceType).toContain("Candidate coaching");
    expect(schema.description).not.toMatch(/UK-wide/i);
  });

  it("builds FAQ structured data from the visible questions and answers", () => {
    const schema = buildFaqSchema([
      { question: "A verified question?", answer: "A verified answer." },
    ]);

    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: "A verified question?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A verified answer.",
      },
    });
  });
});
