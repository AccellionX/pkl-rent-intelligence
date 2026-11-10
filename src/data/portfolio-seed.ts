import type { Building, Unit } from "./types";
import { veteransBuilding, veteransUnits, VETERANS_BUILDING_ID } from "./veterans";

const RI_CITIES = [
  { city: "Providence", state: "RI", zip: "02903", lat: 41.824, lng: -71.4128 },
  { city: "East Providence", state: "RI", zip: "02914", lat: 41.8137, lng: -71.37 },
  { city: "Pawtucket", state: "RI", zip: "02860", lat: 41.8787, lng: -71.3826 },
  { city: "Warwick", state: "RI", zip: "02886", lat: 41.7001, lng: -71.4162 },
  { city: "Cranston", state: "RI", zip: "02910", lat: 41.7798, lng: -71.4373 },
  { city: "Newport", state: "RI", zip: "02840", lat: 41.4901, lng: -71.3128 },
  { city: "Woonsocket", state: "RI", zip: "02895", lat: 42.0029, lng: -71.5148 },
  { city: "Cumberland", state: "RI", zip: "02864", lat: 41.9668, lng: -71.4328 },
  { city: "Barrington", state: "RI", zip: "02806", lat: 41.7407, lng: -71.3087 },
  { city: "Bristol", state: "RI", zip: "02809", lat: 41.6771, lng: -71.2662 },
  { city: "Riverside", state: "RI", zip: "02915", lat: 41.7765, lng: -71.35 },
  { city: "Rumford", state: "RI", zip: "02916", lat: 41.8412, lng: -71.35 },
  { city: "Johnston", state: "RI", zip: "02919", lat: 41.827, lng: -71.505 },
  { city: "North Providence", state: "RI", zip: "02911", lat: 41.8501, lng: -71.4662 },
  { city: "Smithfield", state: "RI", zip: "02917", lat: 41.922, lng: -71.5495 },
];

const MA_CITIES = [
  { city: "Boston", state: "MA", zip: "02116", lat: 42.3505, lng: -71.074 },
  { city: "Cambridge", state: "MA", zip: "02139", lat: 42.3736, lng: -71.1097 },
  { city: "Somerville", state: "MA", zip: "02143", lat: 42.3876, lng: -71.0995 },
  { city: "Brookline", state: "MA", zip: "02445", lat: 42.3318, lng: -71.1212 },
  { city: "Quincy", state: "MA", zip: "02169", lat: 42.2529, lng: -71.0023 },
  { city: "Fall River", state: "MA", zip: "02720", lat: 41.7015, lng: -71.155 },
  { city: "New Bedford", state: "MA", zip: "02740", lat: 41.6362, lng: -70.9342 },
  { city: "Attleboro", state: "MA", zip: "02703", lat: 41.9445, lng: -71.2856 },
];

const CT_CITIES = [
  { city: "Hartford", state: "CT", zip: "06103", lat: 41.7658, lng: -72.6734 },
  { city: "New Haven", state: "CT", zip: "06510", lat: 41.3083, lng: -72.9279 },
  { city: "Stamford", state: "CT", zip: "06901", lat: 41.0534, lng: -73.5387 },
  { city: "Norwalk", state: "CT", zip: "06850", lat: 41.1177, lng: -73.4082 },
];

const ALL_CITIES = [...RI_CITIES, ...MA_CITIES, ...CT_CITIES];

const STREET_NAMES = [
  "Main",
  "Hope",
  "Benefit",
  "Angell",
  "Waterman",
  "Thayer",
  "Broadway",
  "Westminster",
  "Empire",
  "Fountain",
  "Exchange",
  "Eddy",
  "Dyer",
  "Wickenden",
  "South Water",
  "North Main",
  "Smith",
  "Chalkstone",
  "Douglas",
  "Mineral Spring",
  "Park",
  "Oak",
  "Maple",
  "Cedar",
  "Pine",
  "Harbor",
  "Bay",
  "Ocean",
  "River",
  "Bridge",
  "Station",
  "Market",
  "Church",
  "School",
  "Union",
  "Liberty",
  "Independence",
  "Veterans",
  "Memorial",
  "College",
];

const SUFFIXES = ["St", "Ave", "Rd", "Blvd", "Way", "Pkwy", "Ln", "Dr", "Ct"];

const BUILDING_PREFIXES = [
  "The Residences at",
  "Parkside",
  "Harborview",
  "Summit",
  "Gateway",
  "Landmark",
  "Copperfield",
  "Elmwood",
  "Riverwalk",
  "Station House",
  "The Commons at",
  "Liberty Place",
  "Bayfront",
  "The Lofts at",
  "Courtland",
  "Ashford",
  "Brighton",
  "Camden",
  "Dalton",
  "Everett",
];

const MANAGERS = [
  "Ria Driscoll",
  "James Okonkwo",
  "Maria Santos",
  "Daniel Chen",
  "Ava Patel",
  "Noah Bernstein",
  "Sofia Alvarez",
  "Liam Gallagher",
  "Emma Torres",
  "Oliver Kim",
];

const AMENITY_POOL = [
  "Fitness center",
  "In-unit washer/dryer",
  "Parking",
  "Balcony",
  "Pet-friendly",
  "Pool",
  "Elevator",
  "Rooftop deck",
  "Package room",
  "Bike storage",
  "EV charging",
  "Clubhouse",
  "Business center",
  "Concierge",
  "Storage lockers",
];

const IMAGE_POOL = [
  "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
];

const PORTFOLIOS: Building["portfolio"][] = [
  "core",
  "value-add",
  "lease-up",
  "stabilized",
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function sampleAmenities(rand: () => number, count: number) {
  const shuffled = [...AMENITY_POOL].sort(() => rand() - 0.5);
  return shuffled.slice(0, count);
}

function generateOccupiedUnits(
  buildingId: string,
  count: number,
  baseRent: number,
  rand: () => number,
): Unit[] {
  const units: Unit[] = [];
  const letters = ["A", "B", "C", "D"];
  for (let i = 0; i < count; i++) {
    const floor = Math.floor(i / 4) + 1;
    const letter = letters[i % 4]!;
    const beds = rand() > 0.55 ? (rand() > 0.7 ? 2 : 1) : rand() > 0.85 ? 3 : 0;
    const baths = beds === 0 ? 1 : beds === 1 ? 1 : beds === 2 ? (rand() > 0.4 ? 2 : 1) : 2;
    const sqft =
      beds === 0
        ? 450 + Math.floor(rand() * 120)
        : beds === 1
          ? 650 + Math.floor(rand() * 250)
          : beds === 2
            ? 900 + Math.floor(rand() * 300)
            : 1100 + Math.floor(rand() * 350);
    const rentMultiplier = 0.85 + rand() * 0.35;
    const askingRent = Math.round((baseRent * (0.7 + beds * 0.25) * rentMultiplier) / 5) * 5;
    const statusRoll = rand();
    const status: Unit["status"] =
      statusRoll > 0.92 ? "available" : statusRoll > 0.88 ? "pending" : statusRoll > 0.97 ? "offline" : "leased";
    units.push({
      id: `${buildingId}-u${i + 1}`,
      buildingId,
      unitNumber: `${letter}${floor}${String((i % 10) + 1).padStart(2, "0")}`,
      beds,
      baths,
      sqft,
      askingRent,
      marketRent: Math.round(askingRent * (0.97 + rand() * 0.08)),
      status,
      availableDate: status === "available" ? "2026-11-15" : null,
      floor,
      psf: Number((askingRent / sqft).toFixed(2)),
    });
  }
  return units;
}

function generatePortfolio(): { buildings: Building[]; units: Unit[] } {
  const rand = seededRandom(42);
  const buildings: Building[] = [veteransBuilding];
  const units: Unit[] = [...veteransUnits];

  // Generate enough buildings so total units exceed 500 (Veterans already has 3 available shown;
  // we also need occupied units for Veterans to reach 34).
  const veteransOccupied = generateOccupiedUnits(
    VETERANS_BUILDING_ID,
    31,
    2050,
    seededRandom(99),
  ).map((u, idx) => ({
    ...u,
    unitNumber: `B${String(idx + 1).padStart(3, "0")}`,
    status: "leased" as const,
    availableDate: null,
  }));
  units.push(...veteransOccupied);

  for (let i = 0; i < 119; i++) {
    const loc = pick(rand, ALL_CITIES);
    const streetNum = 10 + Math.floor(rand() * 980);
    const street = `${streetNum} ${pick(rand, STREET_NAMES)} ${pick(rand, SUFFIXES)}`;
    const unitCount = 4 + Math.floor(rand() * 28);
    const yearBuilt = 1920 + Math.floor(rand() * 105);
    const stories = 2 + Math.floor(rand() * 8);
    const baseRent =
      loc.state === "MA" ? 2200 + Math.floor(rand() * 1400) : 1600 + Math.floor(rand() * 900);
    const id = `bldg-${i + 1}`;
    const prefix = pick(rand, BUILDING_PREFIXES);
    const name =
      rand() > 0.45
        ? `${street}`
        : `${prefix} ${loc.city.split(" ")[0]}`;
    const buildingUnits = generateOccupiedUnits(id, unitCount, baseRent, rand);
    const vacant = buildingUnits.filter((u) => u.status === "available").length;
    const occupied = buildingUnits.filter((u) => u.status === "leased" || u.status === "pending");
    const avgRent =
      occupied.length > 0
        ? Math.round(occupied.reduce((s, u) => s + u.askingRent, 0) / occupied.length)
        : baseRent;
    const avgPsf =
      occupied.length > 0
        ? Number(
            (
              occupied.reduce((s, u) => s + u.askingRent / u.sqft, 0) / occupied.length
            ).toFixed(2),
          )
        : Number((baseRent / 800).toFixed(2));

    buildings.push({
      id,
      name,
      marketingName: rand() > 0.7 ? `${prefix} ${loc.city}` : undefined,
      address: street,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
      yearBuilt,
      stories,
      unitCount,
      lat: loc.lat + (rand() - 0.5) * 0.04,
      lng: loc.lng + (rand() - 0.5) * 0.04,
      imageUrl: pick(rand, IMAGE_POOL),
      amenities: sampleAmenities(rand, 4 + Math.floor(rand() * 5)),
      occupancyRate: Number(((unitCount - vacant) / unitCount).toFixed(3)),
      avgRent,
      avgPsf,
      vacancyCount: vacant,
      portfolio: pick(rand, PORTFOLIOS),
      manager: pick(rand, MANAGERS),
      isFeatured: false,
    });
    units.push(...buildingUnits);
  }

  return { buildings, units };
}

const seeded = generatePortfolio();

export const seedBuildings = seeded.buildings;
export const seedUnits = seeded.units;

export const portfolioStats = (() => {
  const buildingCount = seedBuildings.length;
  const unitCount = seedUnits.length;
  const vacantUnits = seedUnits.filter((u) => u.status === "available").length;
  const occupiedUnits = seedUnits.filter(
    (u) => u.status === "leased" || u.status === "pending",
  ).length;
  const leased = seedUnits.filter((u) => u.status === "leased");
  const avgRent =
    leased.length > 0
      ? Math.round(leased.reduce((s, u) => s + u.askingRent, 0) / leased.length)
      : 0;
  const avgPsf =
    leased.length > 0
      ? Number(
          (leased.reduce((s, u) => s + u.askingRent / u.sqft, 0) / leased.length).toFixed(2),
        )
      : 0;
  return {
    buildingCount,
    unitCount,
    occupiedUnits,
    vacantUnits,
    occupancyRate: occupiedUnits / unitCount,
    avgRent,
    avgPsf,
    monthlyRevenue: leased.reduce((s, u) => s + u.askingRent, 0),
    reportsThisMonth: 12,
  };
})();
