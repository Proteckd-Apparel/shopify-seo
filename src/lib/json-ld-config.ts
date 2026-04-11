// Persisted JSON-LD settings — stored on Settings.optimizerRules under
// `jsonLd`. Mirrors SEO King's tabs (Products, Collections, LocalBusiness,
// Other).

export type ItemCondition =
  | "new"
  | "refurbished"
  | "used"
  | "damaged";

export type Gender = "" | "male" | "female" | "unisex";
export type AgeGroup = "" | "newborn" | "infant" | "toddler" | "kids" | "adult";

export type ProductsJsonLdConfig = {
  enabled: boolean;
  showStarRating: boolean;
  showRandomRating: boolean;
  numberOfRatings: "less_5" | "less_20" | "less_50" | "less_100";
  alwaysShow5Stars: boolean;
  resetRandomRatings: boolean;
  alwaysShowInStock: boolean;
  brandSource: "store_name" | "vendor";
  descriptionType: "meta_description" | "html_body" | "title";
  itemCondition: ItemCondition;
  gender: Gender;
  ageGroup: AgeGroup;
  handlingTimeMinDays: number;
  handlingTimeMaxDays: number;
  shippingTimeMinDays: number | null;
  shippingTimeMaxDays: number | null;
  freeShipping: boolean;
  freeShippingWorldwide: boolean;
  freeShippingThreshold: number | null;
  shippingRegion: string; // primary ISO country code
  shippingCountries: string; // comma-separated extra ISO codes (eg "US,GB,DE,FR")
  currency: string; // ISO 4217 currency code (eg "USD")
  returnPolicyUrl: string;
  allowReturns: "no_returns" | "x_days" | "always";
  returnDaysLimit: number;
  returnMethod: "by_mail" | "in_store" | "either";
  returnFees: "free_shipping" | "customer_pays" | "restocking_fee";
};

export type CollectionsJsonLdConfig = {
  enabled: boolean;
  showStarRating: boolean;
};

export type LocalBusinessJsonLdConfig = {
  enabled: boolean;
  businessName: string;
  streetAddress: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
  priceRange: string; // e.g. "$$"
  openingHours: string; // e.g. "Mo-Fr 09:00-18:00"
  latitude: string;
  longitude: string;
};

export type OtherJsonLdConfig = {
  website: boolean;
  organization: boolean;
  article: boolean;
  blog: boolean;
  breadcrumb: boolean;
};

export type JsonLdConfig = {
  products: ProductsJsonLdConfig;
  collections: CollectionsJsonLdConfig;
  localBusiness: LocalBusinessJsonLdConfig;
  other: OtherJsonLdConfig;
};

export const DEFAULT_JSON_LD_CONFIG: JsonLdConfig = {
  products: {
    enabled: false,
    showStarRating: true,
    showRandomRating: false,
    numberOfRatings: "less_20",
    alwaysShow5Stars: false,
    resetRandomRatings: false,
    alwaysShowInStock: true,
    brandSource: "store_name",
    descriptionType: "meta_description",
    itemCondition: "new",
    gender: "",
    ageGroup: "",
    handlingTimeMinDays: 1,
    handlingTimeMaxDays: 2,
    shippingTimeMinDays: null,
    shippingTimeMaxDays: null,
    freeShipping: false,
    freeShippingWorldwide: false,
    freeShippingThreshold: null,
    shippingRegion: "US",
    shippingCountries:
      "US,GB,JP,DE,FR,CA,BR,AU,ES,IT,NL,SE,NO,HR,EE,AT,SA,AE,ZA,CZ,IL,AR,CL,CO,GR,RO,PE",
    currency: "USD",
    returnPolicyUrl: "",
    allowReturns: "x_days",
    returnDaysLimit: 30,
    returnMethod: "by_mail",
    returnFees: "free_shipping",
  },
  collections: {
    enabled: false,
    showStarRating: true,
  },
  localBusiness: {
    enabled: false,
    businessName: "",
    streetAddress: "",
    city: "",
    region: "",
    postalCode: "",
    country: "US",
    phone: "",
    priceRange: "$$",
    openingHours: "",
    latitude: "",
    longitude: "",
  },
  other: {
    website: true,
    organization: true,
    article: true,
    blog: true,
    breadcrumb: true,
  },
};
