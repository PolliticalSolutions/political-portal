import { CONTACT_EMAIL, LOGO_PATH, SITE_LEGAL_NAME, SITE_NAME, SITE_URL } from "./seoConfig.js";

export const buildOrganisationSchema = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_LEGAL_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}${LOGO_PATH}`,
  email: CONTACT_EMAIL,
  areaServed: "GB",
});

export const buildWebsiteSchema = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  publisher: {
    "@type": "Organization",
    name: SITE_LEGAL_NAME,
    url: SITE_URL,
  },
});

export const buildServicesSchema = () => ({
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Political operations services",
  description:
    "UK-wide marked register processing, data insights, subscription platform access, training, and operational support.",
  provider: {
    "@type": "Organization",
    name: SITE_LEGAL_NAME,
    url: SITE_URL,
  },
  areaServed: "GB",
  serviceType: [
    "Marked register processing",
    "Data and insight",
    "Subscription platform",
    "Campaigning, Training & Election Support",
  ],
});

export const buildFaqSchema = (faqs) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: answer,
    },
  })),
});

export const buildElectionSupportSchema = () => ({
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Campaigning, Training & Election Support",
  description:
    "UK-wide Campaigning, Training & Election Support for campaign operations, data coordination, and delivery planning.",
  provider: {
    "@type": "Organization",
    name: SITE_LEGAL_NAME,
    url: SITE_URL,
  },
  areaServed: "GB",
  serviceType: [
    "Campaign operations support",
    "Volunteer briefing and training",
    "Data and print coordination",
    "Field operations planning",
  ],
});
