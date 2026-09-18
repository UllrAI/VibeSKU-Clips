import { render, screen } from "@testing-library/react";
import type React from "react";

const createMockSection = (label: string) =>
  jest.fn(() => (
    <section data-testid="homepage-section" data-component={label}>
      {label}
    </section>
  ));

const mockHero = createMockSection("Hero");
jest.mock("@/components/homepage/hero", () => ({
  Hero: (props: React.ComponentProps<any>) => mockHero(props),
}));

const mockHowItWorks = createMockSection("HowItWorks");
jest.mock("@/components/homepage/how-it-works", () => ({
  HowItWorks: (props: React.ComponentProps<any>) => mockHowItWorks(props),
}));

const mockCreativeControl = createMockSection("CreativeControl");
jest.mock("@/components/homepage/creative-control", () => ({
  CreativeControl: (props: React.ComponentProps<any>) =>
    mockCreativeControl(props),
}));

const mockHomeFaq = createMockSection("HomeFaq");
jest.mock("@/components/homepage/faq", () => ({
  HomeFaq: (props: React.ComponentProps<any>) => mockHomeFaq(props),
}));

const mockCallToAction = createMockSection("CallToAction");
jest.mock("@/components/homepage/call-to-action", () => ({
  CallToAction: (props: React.ComponentProps<any>) => mockCallToAction(props),
}));

const mockCreateLocalizedAlternates = jest.fn(() => ({
  canonical: "/",
  languages: {
    en: "/",
    "zh-Hans": "/zh-Hans",
  },
}));
const mockCreateMetadataDefaults = jest.fn(() => ({
  openGraph: {
    siteName: "UllrAI",
  },
  twitter: {
    card: "summary_large_image",
  },
}));
jest.mock("@/lib/metadata", () => ({
  createLocalizedAlternates: (...args: unknown[]) =>
    mockCreateLocalizedAlternates(...args),
  createMetadataDefaults: (...args: unknown[]) =>
    mockCreateMetadataDefaults(...args),
}));

import HomePage, { generateMetadata } from "./page";

describe("HomePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds localized metadata for the marketing homepage", async () => {
    await expect(generateMetadata()).resolves.toMatchObject({
      title: "VibeSKU Clips",
      description:
        "Turn one product link or photo into a localised 15-second UGC clip, with visible checkpoints, quality checks, and review.",
    });

    expect(mockCreateLocalizedAlternates).toHaveBeenCalledWith("/", "en");
    expect(mockCreateMetadataDefaults).toHaveBeenCalledWith({
      locale: "en",
      alternates: {
        canonical: "/",
        languages: {
          en: "/",
          "zh-Hans": "/zh-Hans",
        },
      },
    });
  });

  it("renders the marketing sections in the expected order", () => {
    render(<HomePage />);

    const sections = screen.getAllByTestId("homepage-section");
    expect(
      sections.map((section) => section.getAttribute("data-component")),
    ).toEqual([
      "Hero",
      "HowItWorks",
      "CreativeControl",
      "HomeFaq",
      "CallToAction",
    ]);

    expect(mockHero).toHaveBeenCalledTimes(1);
    expect(mockHowItWorks).toHaveBeenCalledTimes(1);
    expect(mockCreativeControl).toHaveBeenCalledTimes(1);
    expect(mockHomeFaq).toHaveBeenCalledTimes(1);
    expect(mockCallToAction).toHaveBeenCalledTimes(1);
  });
});
