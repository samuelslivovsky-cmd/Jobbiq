/** Target markets the crawler covers (ISO 3166-1 alpha-2, lowercase). */
export const SUPPORTED_COUNTRIES = ["sk", "cz", "hu", "pl", "de", "at"] as const;
export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number];

export const COUNTRY_LABELS: Record<CountryCode, string> = {
  sk: "Slovensko",
  cz: "Česko",
  hu: "Maďarsko",
  pl: "Poľsko",
  de: "Nemecko",
  at: "Rakúsko",
};

export function isCountryCode(value: string): value is CountryCode {
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(value);
}

/** Preference countries → effective list (empty selection means "all"). */
export function effectiveCountries(selected: string[]): CountryCode[] {
  const valid = selected.map((c) => c.toLowerCase()).filter(isCountryCode);
  return valid.length > 0 ? valid : [...SUPPORTED_COUNTRIES];
}

/** Lowercase + strip diacritics, for tolerant comparisons. */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .trim();
}

/**
 * Major cities (with common exonyms) per country. Used to route a
 * preference's free-text locations to the right country when one search
 * spans several markets — "Bratislava" should not be sent to a German board.
 */
const CITY_COUNTRY: Record<string, CountryCode> = {};
const CITIES: Record<CountryCode, string[]> = {
  sk: [
    "bratislava", "pressburg", "pozsony", "kosice", "kaschau", "kassa", "presov",
    "zilina", "nitra", "banska bystrica", "trnava", "trencin", "martin", "poprad",
    "piestany", "zvolen", "michalovce", "slovensko", "slovakia", "slowakei",
  ],
  cz: [
    "praha", "prague", "prag", "brno", "brunn", "ostrava", "plzen", "pilsen",
    "liberec", "olomouc", "ceske budejovice", "hradec kralove", "pardubice",
    "usti nad labem", "zlin", "jihlava", "karlovy vary", "cesko", "czechia",
    "czech republic", "tschechien",
  ],
  hu: [
    "budapest", "debrecen", "szeged", "miskolc", "pecs", "gyor", "nyiregyhaza",
    "kecskemet", "szekesfehervar", "szombathely", "magyarorszag", "hungary",
    "ungarn", "madarsko",
  ],
  pl: [
    "warszawa", "warsaw", "warschau", "krakow", "cracow", "krakau", "wroclaw",
    "breslau", "poznan", "posen", "gdansk", "danzig", "gdynia", "lodz", "katowice",
    "szczecin", "lublin", "bialystok", "bydgoszcz", "rzeszow", "polska", "poland",
    "polen", "polsko",
  ],
  de: [
    "berlin", "hamburg", "munchen", "munich", "koln", "cologne", "frankfurt",
    "stuttgart", "dusseldorf", "leipzig", "dortmund", "essen", "bremen", "dresden",
    "hannover", "nurnberg", "nuremberg", "bonn", "mannheim", "karlsruhe",
    "deutschland", "germany", "nemecko",
  ],
  at: [
    "wien", "vienna", "vieden", "viden", "becs", "graz", "linz", "salzburg",
    "innsbruck", "klagenfurt", "villach", "wels", "st. polten", "sankt polten",
    "dornbirn", "bregenz", "osterreich", "austria", "rakusko",
  ],
};
for (const [country, cities] of Object.entries(CITIES)) {
  for (const city of cities) CITY_COUNTRY[city] = country as CountryCode;
}

/** Country a free-text location belongs to, if it is a known major city. */
export function countryOfLocation(location: string): CountryCode | null {
  const folded = foldText(location);
  if (CITY_COUNTRY[folded]) return CITY_COUNTRY[folded];
  for (const [city, country] of Object.entries(CITY_COUNTRY)) {
    if (folded.startsWith(`${city} `) || folded.startsWith(`${city},`)) {
      return country;
    }
  }
  return null;
}

/**
 * Locations relevant to one country: known cities of that country plus any
 * location we can't place. Cities known to be elsewhere are dropped, so a
 * country run with no remaining locations searches nationwide.
 */
export function locationsForCountry(
  locations: string[],
  country: CountryCode,
): string[] {
  return locations.filter((location) => {
    const known = countryOfLocation(location);
    return known === null || known === country;
  });
}
