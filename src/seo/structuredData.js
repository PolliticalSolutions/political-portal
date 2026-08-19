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
  name: "Data-led campaign management and consultancy",
  description:
    "Campaign management and consultancy, constituency intelligence, and marked-register processing for Conservative associations and campaign teams.",
  provider: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
  },
  serviceType: [
    "Campaigning, Training & Election Support",
    "Constituency Intelligence",
    "Marked Register Processing",
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
    "Data-led campaign management, strategy, candidate coaching, association support, and practical delivery.",
  provider: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
  },
  serviceType: [
    "Campaign management and strategy",
    "Candidate coaching",
    "Association and council-group support",
    "Officer mentoring and volunteer briefings",
    "Data coordination",
    "Print logistics and delivery oversight",
  ],
});
