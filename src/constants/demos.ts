import { DemoBusiness } from "../types";

export const DEMO_BUSINESSES: DemoBusiness[] = [
  {
    "name": "Green Ridge Lawn Care",
    "trade": "Lawn Care",
    "color": "#2D6A4F",
    "emoji": "🌿",
    "tagline": "Your lawn. Our pride.",
    "phone": "(330) 555-0101",
    "schema": {
      "trade": "Lawn Care",
      "fields": [
        {
          "id": "lotSize",
          "label": "Lot Size",
          "type": "selector",
          "options": [
            "Small (under 5,000 sqft)",
            "Medium (5,000-10,000 sqft)",
            "Large (over 10,000 sqft)"
          ],
          "unit": "flat",
          "group": "dimensions"
        },
        {
          "id": "edging",
          "label": "Edging Included",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        },
        {
          "id": "trimming",
          "label": "Trimming Included",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        },
        {
          "id": "leafCleanup",
          "label": "Leaf Cleanup",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "smallLot": 45,
        "mediumLot": 75,
        "largeLot": 120,
        "edgingRate": 15,
        "trimmingRate": 10,
        "leafCleanupRate": 65,
        "minimumCharge": 45,
        "taxRate": 0,
        "depositPercent": 0
      },
      "addOns": [
        {
          "id": "fertilizing",
          "label": "Fertilizing",
          "price": 65
        },
        {
          "id": "aeration",
          "label": "Aeration",
          "price": 85
        },
        {
          "id": "overseeding",
          "label": "Overseeding",
          "price": 95
        },
        {
          "id": "gutterClean",
          "label": "Gutter Cleaning",
          "price": 120
        }
      ],
      "calculation": "(lotSize == 'Small (under 5,000 sqft)' ? smallLot : lotSize == 'Medium (5,000-10,000 sqft)' ? mediumLot : largeLot) + (edging ? edgingRate : 0) + (trimming ? trimmingRate : 0) + (leafCleanup ? leafCleanupRate : 0)",
      "summaryLines": [
        {
          "label": "Lawn service ({lotSize})",
          "value": "lotSize == 'Small (under 5,000 sqft)' ? smallLot : lotSize == 'Medium (5,000-10,000 sqft)' ? mediumLot : largeLot"
        },
        {
          "label": "Edging",
          "value": "edgingRate",
          "showIf": "edging == true"
        },
        {
          "label": "Trimming",
          "value": "trimmingRate",
          "showIf": "trimming == true"
        },
        {
          "label": "Leaf cleanup",
          "value": "leafCleanupRate",
          "showIf": "leafCleanup == true"
        }
      ]
    }
  },
  {
    "name": "Crystal Clear Window Washing",
    "trade": "Window Washing",
    "color": "#0096C7",
    "emoji": "🪟",
    "tagline": "See the difference.",
    "phone": "(330) 555-0102",
    "schema": {
      "trade": "Window Washing",
      "fields": [
        {
          "id": "windowCount",
          "label": "Number of Windows",
          "type": "number",
          "placeholder": "How many windows?",
          "unit": "each",
          "group": "dimensions"
        },
        {
          "id": "stories",
          "label": "Home Stories",
          "type": "selector",
          "options": [
            "1 Story",
            "2 Story",
            "3+ Story"
          ],
          "unit": "flat",
          "group": "dimensions"
        },
        {
          "id": "interiorCleaning",
          "label": "Interior Cleaning",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        },
        {
          "id": "screenCleaning",
          "label": "Screen Cleaning",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "pricePerWindow": 8,
        "heightSurcharge2": 2,
        "heightSurcharge3": 4,
        "interiorRate": 5,
        "screenRate": 3,
        "minimumCharge": 120,
        "taxRate": 0,
        "depositPercent": 0
      },
      "addOns": [
        {
          "id": "trackDetailing",
          "label": "Track Detailing",
          "price": 45
        },
        {
          "id": "hardWater",
          "label": "Hard Water Treatment",
          "price": 85
        },
        {
          "id": "solarPanels",
          "label": "Solar Panel Cleaning",
          "price": 150
        }
      ],
      "calculation": "windowCount * pricePerWindow + (stories == '2 Story' ? windowCount * heightSurcharge2 : stories == '3+ Story' ? windowCount * heightSurcharge3 : 0) + (interiorCleaning ? windowCount * interiorRate : 0) + (screenCleaning ? windowCount * screenRate : 0)",
      "summaryLines": [
        {
          "label": "Windows ({windowCount})",
          "value": "windowCount * pricePerWindow"
        },
        {
          "label": "Height surcharge (2 story)",
          "value": "windowCount * heightSurcharge2",
          "showIf": "stories == '2 Story'"
        },
        {
          "label": "Height surcharge (3+ story)",
          "value": "windowCount * heightSurcharge3",
          "showIf": "stories == '3+ Story'"
        },
        {
          "label": "Interior cleaning",
          "value": "windowCount * interiorRate",
          "showIf": "interiorCleaning == true"
        },
        {
          "label": "Screen cleaning",
          "value": "windowCount * screenRate",
          "showIf": "screenCleaning == true"
        }
      ]
    }
  },
  {
    "name": "Bright Home Cleaning",
    "trade": "House Cleaning",
    "color": "#7B2D8B",
    "emoji": "🏠",
    "tagline": "Clean home. Clear mind.",
    "phone": "(330) 555-0103",
    "schema": {
      "trade": "House Cleaning",
      "fields": [
        {
          "id": "bedrooms",
          "label": "Bedrooms",
          "type": "selector",
          "options": [
            "1 Bedroom",
            "2 Bedrooms",
            "3 Bedrooms",
            "4 Bedrooms",
            "5+ Bedrooms"
          ],
          "unit": "room",
          "group": "dimensions"
        },
        {
          "id": "cleanType",
          "label": "Clean Type",
          "type": "selector",
          "options": [
            "Standard Clean",
            "Deep Clean",
            "Move In/Out"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "suppliesIncluded",
          "label": "We Supply Products",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "bed1": 100,
        "bed2": 130,
        "bed3": 160,
        "bed4": 190,
        "bed5": 220,
        "deepCleanUpcharge": 60,
        "moveInOut": 100,
        "suppliesRate": 25,
        "minimumCharge": 100,
        "taxRate": 0,
        "depositPercent": 0
      },
      "addOns": [
        {
          "id": "insideOven",
          "label": "Inside Oven",
          "price": 35
        },
        {
          "id": "insideFridge",
          "label": "Inside Fridge",
          "price": 35
        },
        {
          "id": "insideCabinets",
          "label": "Inside Cabinets",
          "price": 50
        },
        {
          "id": "laundry",
          "label": "Laundry (wash and fold)",
          "price": 45
        }
      ],
      "calculation": "(bedrooms == '1 Bedroom' ? bed1 : bedrooms == '2 Bedrooms' ? bed2 : bedrooms == '3 Bedrooms' ? bed3 : bedrooms == '4 Bedrooms' ? bed4 : bed5) + (cleanType == 'Deep Clean' ? deepCleanUpcharge : cleanType == 'Move In/Out' ? moveInOut : 0) + (suppliesIncluded ? suppliesRate : 0)",
      "summaryLines": [
        {
          "label": "Base clean ({bedrooms})",
          "value": "bedrooms == '1 Bedroom' ? bed1 : bedrooms == '2 Bedrooms' ? bed2 : bedrooms == '3 Bedrooms' ? bed3 : bedrooms == '4 Bedrooms' ? bed4 : bed5"
        },
        {
          "label": "Deep clean upgrade",
          "value": "deepCleanUpcharge",
          "showIf": "cleanType == 'Deep Clean'"
        },
        {
          "label": "Move in/out clean",
          "value": "moveInOut",
          "showIf": "cleanType == 'Move In/Out'"
        },
        {
          "label": "Supplies included",
          "value": "suppliesRate",
          "showIf": "suppliesIncluded == true"
        }
      ]
    }
  },
  {
    "name": "ProWash Power Washing",
    "trade": "Power Washing",
    "color": "#E76F51",
    "emoji": "💧",
    "tagline": "We blast the rest.",
    "phone": "(330) 555-0104",
    "schema": {
      "trade": "Power Washing",
      "fields": [
        {
          "id": "surface",
          "label": "Primary Surface",
          "type": "selector",
          "options": [
            "Driveway",
            "House Exterior",
            "Deck/Patio",
            "Fence",
            "Sidewalk/Flatwork",
            "Roof"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "sqft",
          "label": "Square Footage",
          "type": "number",
          "placeholder": "Approx. square footage",
          "unit": "sqft",
          "group": "dimensions"
        },
        {
          "id": "sealing",
          "label": "Sealing After Wash",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "drivewayRate": 0.15,
        "houseRate": 0.12,
        "deckRate": 0.18,
        "fenceRate": 0.1,
        "sidewalkRate": 0.08,
        "roofRate": 0.25,
        "sealingRate": 0.35,
        "minimumCharge": 150,
        "taxRate": 0,
        "depositPercent": 25
      },
      "addOns": [
        {
          "id": "gutterBrightening",
          "label": "Gutter Brightening",
          "price": 150
        },
        {
          "id": "windowRinse",
          "label": "Window Rinse",
          "price": 75
        },
        {
          "id": "trashCans",
          "label": "Trash Can Cleaning",
          "price": 45
        }
      ],
      "calculation": "(sqft || 0) * (surface == 'Driveway' ? drivewayRate : surface == 'House Exterior' ? houseRate : surface == 'Deck/Patio' ? deckRate : surface == 'Fence' ? fenceRate : surface == 'Roof' ? roofRate : sidewalkRate) + (sealing ? (sqft || 0) * sealingRate : 0)",
      "summaryLines": [
        {
          "label": "{surface} wash ({sqft} sqft)",
          "value": "(sqft || 0) * (surface == 'Driveway' ? drivewayRate : surface == 'House Exterior' ? houseRate : surface == 'Deck/Patio' ? deckRate : surface == 'Fence' ? fenceRate : surface == 'Roof' ? roofRate : sidewalkRate)"
        },
        {
          "label": "Sealing",
          "value": "(sqft || 0) * sealingRate",
          "showIf": "sealing == true"
        }
      ]
    }
  },
  {
    "name": "Haul It Junk Removal",
    "trade": "Junk Removal",
    "color": "#E63946",
    "emoji": "🚛",
    "tagline": "Gone today.",
    "phone": "(330) 555-0105",
    "schema": {
      "trade": "Junk Removal",
      "fields": [
        {
          "id": "loadSize",
          "label": "Load Size",
          "type": "selector",
          "options": [
            "1/4 Load",
            "1/2 Load",
            "3/4 Load",
            "Full Load"
          ],
          "unit": "load",
          "group": "dimensions"
        },
        {
          "id": "flights",
          "label": "Flights of Stairs",
          "type": "selector",
          "options": [
            "None",
            "1 Flight",
            "2 Flights",
            "3+ Flights"
          ],
          "unit": "flat",
          "group": "fees"
        },
        {
          "id": "sameDay",
          "label": "Same Day Service",
          "type": "toggle",
          "unit": "flat",
          "group": "fees"
        },
        {
          "id": "heavyItems",
          "label": "Heavy Items (piano, safe, appliance)",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "quarterLoad": 125,
        "halfLoad": 225,
        "threeQuarterLoad": 325,
        "fullLoad": 425,
        "stairFee1": 25,
        "stairFee2": 50,
        "stairFee3": 75,
        "sameDayUpcharge": 50,
        "heavyItemFee": 75,
        "minimumCharge": 125,
        "taxRate": 0,
        "depositPercent": 0
      },
      "addOns": [
        {
          "id": "demoDebris",
          "label": "Demo/Construction Debris",
          "price": 75
        },
        {
          "id": "eWaste",
          "label": "E-Waste Disposal",
          "price": 50
        },
        {
          "id": "donation",
          "label": "Donation Drop-Off",
          "price": 35
        }
      ],
      "calculation": "(loadSize == '1/4 Load' ? quarterLoad : loadSize == '1/2 Load' ? halfLoad : loadSize == '3/4 Load' ? threeQuarterLoad : fullLoad) + (flights == '1 Flight' ? stairFee1 : flights == '2 Flights' ? stairFee2 : flights == '3+ Flights' ? stairFee3 : 0) + (sameDay ? sameDayUpcharge : 0) + (heavyItems ? heavyItemFee : 0)",
      "summaryLines": [
        {
          "label": "Load ({loadSize})",
          "value": "loadSize == '1/4 Load' ? quarterLoad : loadSize == '1/2 Load' ? halfLoad : loadSize == '3/4 Load' ? threeQuarterLoad : fullLoad"
        },
        {
          "label": "Stair fee",
          "value": "flights == '1 Flight' ? stairFee1 : flights == '2 Flights' ? stairFee2 : stairFee3",
          "showIf": "flights != 'None'"
        },
        {
          "label": "Same day service",
          "value": "sameDayUpcharge",
          "showIf": "sameDay == true"
        },
        {
          "label": "Heavy item fee",
          "value": "heavyItemFee",
          "showIf": "heavyItems == true"
        }
      ]
    }
  },
  {
    "name": "Lights Out Christmas Lighting",
    "trade": "Christmas Lights",
    "color": "#BC6C25",
    "emoji": "🎄",
    "tagline": "Northeast Ohio Holiday Lighting",
    "phone": "(330) 555-0106",
    "schema": {
      "trade": "Christmas Lights",
      "fields": [
        {
          "id": "rooflineFootage",
          "label": "Roofline Footage (ft)",
          "type": "number",
          "placeholder": "Linear feet of roofline",
          "unit": "lf",
          "group": "dimensions"
        },
        {
          "id": "bulbType",
          "label": "Bulb Type",
          "type": "selector",
          "options": [
            "C9 Warm White",
            "Mini Lights",
            "Custom Cut RGB"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "smallTrees",
          "label": "Small Trees (under 10ft)",
          "type": "number",
          "placeholder": "Number of trees",
          "unit": "each",
          "group": "dimensions"
        },
        {
          "id": "mediumTrees",
          "label": "Medium Trees (10-20ft)",
          "type": "number",
          "placeholder": "Number of trees",
          "unit": "each",
          "group": "dimensions"
        },
        {
          "id": "largeTrees",
          "label": "Large Trees (20-35ft)",
          "type": "number",
          "placeholder": "Number of trees",
          "unit": "each",
          "group": "dimensions"
        },
        {
          "id": "wreathCount",
          "label": "Wreaths",
          "type": "number",
          "placeholder": "Number of wreaths",
          "unit": "each",
          "group": "extras"
        },
        {
          "id": "garlandFeet",
          "label": "Garland (linear feet)",
          "type": "number",
          "placeholder": "Linear feet of garland",
          "unit": "lf",
          "group": "extras"
        },
        {
          "id": "customerOwnedLights",
          "label": "Customer Owns Lights (Install Only)",
          "type": "toggle",
          "unit": "flat",
          "group": "lighting"
        }
      ],
      "pricing": {
        "c9Rate": 8,
        "miniRate": 6,
        "rgbRate": 14,
        "installOnlyRate": 4,
        "smallTreeRate": 150,
        "mediumTreeRate": 275,
        "largeTreeRate": 450,
        "wreathRate": 125,
        "garlandRate": 20,
        "minimumCharge": 500,
        "taxRate": 0,
        "depositPercent": 25
      },
      "addOns": [
        {
          "id": "pathwayLighting",
          "label": "Pathway Lighting",
          "price": 200
        },
        {
          "id": "shrubLighting",
          "label": "Shrub Lighting",
          "price": 150
        },
        {
          "id": "timerSetup",
          "label": "Smart Timer Setup",
          "price": 75
        },
        {
          "id": "storageReturning",
          "label": "Off-Season Storage",
          "price": 100
        }
      ],
      "calculation": "(customerOwnedLights ? rooflineFootage * installOnlyRate : bulbType == 'C9 Warm White' ? rooflineFootage * c9Rate : bulbType == 'Mini Lights' ? rooflineFootage * miniRate : rooflineFootage * rgbRate) + (smallTrees || 0) * smallTreeRate + (mediumTrees || 0) * mediumTreeRate + (largeTrees || 0) * largeTreeRate + (wreathCount || 0) * wreathRate + (garlandFeet || 0) * garlandRate",
      "summaryLines": [
        {
          "label": "Roofline ({rooflineFootage} ft)",
          "value": "customerOwnedLights ? rooflineFootage * installOnlyRate : bulbType == 'C9 Warm White' ? rooflineFootage * c9Rate : bulbType == 'Mini Lights' ? rooflineFootage * miniRate : rooflineFootage * rgbRate"
        },
        {
          "label": "Small trees ({smallTrees})",
          "value": "(smallTrees || 0) * smallTreeRate",
          "showIf": "smallTrees > 0"
        },
        {
          "label": "Medium trees ({mediumTrees})",
          "value": "(mediumTrees || 0) * mediumTreeRate",
          "showIf": "mediumTrees > 0"
        },
        {
          "label": "Large trees ({largeTrees})",
          "value": "(largeTrees || 0) * largeTreeRate",
          "showIf": "largeTrees > 0"
        },
        {
          "label": "Wreaths ({wreathCount})",
          "value": "(wreathCount || 0) * wreathRate",
          "showIf": "wreathCount > 0"
        },
        {
          "label": "Garland ({garlandFeet} ft)",
          "value": "(garlandFeet || 0) * garlandRate",
          "showIf": "garlandFeet > 0"
        }
      ]
    }
  },
  {
    "name": "Apex Mobile Detailing",
    "trade": "Mobile Detailing",
    "color": "#1D3557",
    "emoji": "🚗",
    "tagline": "We come to you.",
    "phone": "(330) 555-0107",
    "schema": {
      "trade": "Mobile Detailing",
      "fields": [
        {
          "id": "vehicleSize",
          "label": "Vehicle Size",
          "type": "selector",
          "options": [
            "Sedan/Coupe",
            "SUV/Crossover",
            "Truck/Van",
            "Large SUV/Sprinter"
          ],
          "unit": "vehicle",
          "group": "dimensions"
        },
        {
          "id": "servicePackage",
          "label": "Service Package",
          "type": "selector",
          "options": [
            "Exterior Only",
            "Interior Only",
            "Full Detail"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "paintCorrection",
          "label": "Paint Correction",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "sedanExterior": 75,
        "sedanInterior": 85,
        "sedanFull": 145,
        "suvExterior": 95,
        "suvInterior": 105,
        "suvFull": 185,
        "truckExterior": 110,
        "truckInterior": 120,
        "truckFull": 210,
        "largeExterior": 130,
        "largeInterior": 140,
        "largeFull": 250,
        "paintCorrectionRate": 150,
        "minimumCharge": 75,
        "taxRate": 0,
        "depositPercent": 0
      },
      "addOns": [
        {
          "id": "clayBar",
          "label": "Clay Bar Treatment",
          "price": 75
        },
        {
          "id": "ceramicCoating",
          "label": "Ceramic Coating",
          "price": 350
        },
        {
          "id": "engineBay",
          "label": "Engine Bay Detail",
          "price": 65
        },
        {
          "id": "headlights",
          "label": "Headlight Restoration",
          "price": 85
        }
      ],
      "calculation": "(vehicleSize == 'Sedan/Coupe' ? (servicePackage == 'Exterior Only' ? sedanExterior : servicePackage == 'Interior Only' ? sedanInterior : sedanFull) : vehicleSize == 'SUV/Crossover' ? (servicePackage == 'Exterior Only' ? suvExterior : servicePackage == 'Interior Only' ? suvInterior : suvFull) : vehicleSize == 'Truck/Van' ? (servicePackage == 'Exterior Only' ? truckExterior : servicePackage == 'Interior Only' ? truckInterior : truckFull) : (servicePackage == 'Exterior Only' ? largeExterior : servicePackage == 'Interior Only' ? largeInterior : largeFull)) + (paintCorrection ? paintCorrectionRate : 0)",
      "summaryLines": [
        {
          "label": "{servicePackage} — {vehicleSize}",
          "value": "vehicleSize == 'Sedan/Coupe' ? (servicePackage == 'Exterior Only' ? sedanExterior : servicePackage == 'Interior Only' ? sedanInterior : sedanFull) : vehicleSize == 'SUV/Crossover' ? (servicePackage == 'Exterior Only' ? suvExterior : servicePackage == 'Interior Only' ? suvInterior : suvFull) : vehicleSize == 'Truck/Van' ? (servicePackage == 'Exterior Only' ? truckExterior : servicePackage == 'Interior Only' ? truckInterior : truckFull) : (servicePackage == 'Exterior Only' ? largeExterior : servicePackage == 'Interior Only' ? largeInterior : largeFull)"
        },
        {
          "label": "Paint correction",
          "value": "paintCorrectionRate",
          "showIf": "paintCorrection == true"
        }
      ]
    }
  },
  {
    "name": "Summit Tree Service",
    "trade": "Tree Service",
    "color": "#344E41",
    "emoji": "🌳",
    "tagline": "From roots to removal.",
    "phone": "(330) 555-0108",
    "schema": {
      "trade": "Tree Service",
      "fields": [
        {
          "id": "serviceType",
          "label": "Service Type",
          "type": "selector",
          "options": [
            "Full Removal",
            "Trimming/Pruning",
            "Stump Grinding",
            "Emergency Storm"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "treeSize",
          "label": "Tree Size",
          "type": "selector",
          "options": [
            "Small (under 20ft)",
            "Medium (20-40ft)",
            "Large (40-60ft)",
            "Extra Large (60ft+)"
          ],
          "unit": "flat",
          "group": "dimensions"
        },
        {
          "id": "treeCount",
          "label": "Number of Trees",
          "type": "number",
          "placeholder": "How many trees?",
          "unit": "each",
          "group": "dimensions"
        },
        {
          "id": "debrisHauling",
          "label": "Debris Hauling Included",
          "type": "toggle",
          "unit": "flat",
          "group": "fees"
        }
      ],
      "pricing": {
        "smallRemoval": 350,
        "mediumRemoval": 650,
        "largeRemoval": 1200,
        "xlRemoval": 2000,
        "smallTrim": 150,
        "mediumTrim": 275,
        "largeTrim": 450,
        "xlTrim": 700,
        "stumpGrind": 175,
        "haulRate": 100,
        "minimumCharge": 150,
        "taxRate": 0,
        "depositPercent": 25
      },
      "addOns": [
        {
          "id": "cabling",
          "label": "Tree Cabling/Bracing",
          "price": 250
        },
        {
          "id": "stumpChemical",
          "label": "Stump Chemical Treatment",
          "price": 85
        },
        {
          "id": "arboristReport",
          "label": "Arborist Report",
          "price": 150
        }
      ],
      "calculation": "(treeCount || 1) * (serviceType == 'Stump Grinding' ? stumpGrind : treeSize == 'Small (under 20ft)' ? (serviceType == 'Full Removal' ? smallRemoval : smallTrim) : treeSize == 'Medium (20-40ft)' ? (serviceType == 'Full Removal' ? mediumRemoval : mediumTrim) : treeSize == 'Large (40-60ft)' ? (serviceType == 'Full Removal' ? largeRemoval : largeTrim) : (serviceType == 'Full Removal' ? xlRemoval : xlTrim)) + (debrisHauling ? haulRate * (treeCount || 1) : 0)",
      "summaryLines": [
        {
          "label": "{serviceType} x{treeCount}",
          "value": "(treeCount || 1) * (serviceType == 'Stump Grinding' ? stumpGrind : treeSize == 'Small (under 20ft)' ? (serviceType == 'Full Removal' ? smallRemoval : smallTrim) : treeSize == 'Medium (20-40ft)' ? (serviceType == 'Full Removal' ? mediumRemoval : mediumTrim) : treeSize == 'Large (40-60ft)' ? (serviceType == 'Full Removal' ? largeRemoval : largeTrim) : (serviceType == 'Full Removal' ? xlRemoval : xlTrim))"
        },
        {
          "label": "Debris hauling",
          "value": "haulRate * (treeCount || 1)",
          "showIf": "debrisHauling == true"
        }
      ]
    }
  },
  {
    "name": "Reliable Handyman",
    "trade": "Handyman",
    "color": "#6B4226",
    "emoji": "🔨",
    "tagline": "One call. Done right.",
    "phone": "(330) 555-0109",
    "schema": {
      "trade": "Handyman",
      "fields": [
        {
          "id": "jobType",
          "label": "Job Type",
          "type": "selector",
          "options": [
            "Hourly Work",
            "Flat Rate Task",
            "Punch List (multiple tasks)"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "hours",
          "label": "Estimated Hours",
          "type": "number",
          "placeholder": "Number of hours",
          "unit": "hr",
          "group": "dimensions"
        },
        {
          "id": "taskCount",
          "label": "Number of Tasks",
          "type": "number",
          "placeholder": "Number of tasks",
          "unit": "each",
          "group": "dimensions"
        }
      ],
      "pricing": {
        "hourlyRate": 85,
        "flatRateTask": 125,
        "punchListPerTask": 95,
        "travelFee": 35,
        "minimumCharge": 85,
        "taxRate": 0,
        "depositPercent": 0
      },
      "addOns": [
        {
          "id": "tvMount",
          "label": "TV Mounting",
          "price": 95
        },
        {
          "id": "furnitureAssembly",
          "label": "Furniture Assembly",
          "price": 75
        },
        {
          "id": "drywallPatch",
          "label": "Drywall Patch",
          "price": 65
        },
        {
          "id": "doorAdjust",
          "label": "Door/Window Adjustment",
          "price": 55
        }
      ],
      "calculation": "(jobType == 'Hourly Work' ? (hours || 1) * hourlyRate : jobType == 'Flat Rate Task' ? flatRateTask : (taskCount || 1) * punchListPerTask) + travelFee",
      "summaryLines": [
        {
          "label": "Hourly work ({hours} hrs)",
          "value": "(hours || 1) * hourlyRate",
          "showIf": "jobType == 'Hourly Work'"
        },
        {
          "label": "Flat rate task",
          "value": "flatRateTask",
          "showIf": "jobType == 'Flat Rate Task'"
        },
        {
          "label": "Punch list ({taskCount} tasks)",
          "value": "(taskCount || 1) * punchListPerTask",
          "showIf": "jobType == 'Punch List (multiple tasks)'"
        },
        {
          "label": "Travel fee",
          "value": "travelFee"
        }
      ]
    }
  },
  {
    "name": "Metro Moving Co",
    "trade": "Moving Company",
    "color": "#2979FF",
    "emoji": "🚚",
    "tagline": "We move. You relax.",
    "phone": "(330) 555-0110",
    "schema": {
      "trade": "Moving Company",
      "fields": [
        {
          "id": "crewSize",
          "label": "Crew Size",
          "type": "selector",
          "options": [
            "2 Men",
            "3 Men",
            "4 Men"
          ],
          "unit": "flat",
          "group": "dimensions"
        },
        {
          "id": "hours",
          "label": "Estimated Hours",
          "type": "number",
          "placeholder": "Estimated move hours",
          "unit": "hr",
          "group": "dimensions"
        },
        {
          "id": "moveType",
          "label": "Move Type",
          "type": "selector",
          "options": [
            "Local Move",
            "Long Distance"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "flights",
          "label": "Flights of Stairs",
          "type": "selector",
          "options": [
            "None",
            "1 Flight",
            "2 Flights",
            "3+ Flights"
          ],
          "unit": "flat",
          "group": "fees"
        },
        {
          "id": "packing",
          "label": "Packing Service",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "rate2men": 120,
        "rate3men": 160,
        "rate4men": 200,
        "longDistanceRate": 1.5,
        "stairFee": 35,
        "packingRate": 45,
        "minimumHours": 2,
        "travelFee": 50,
        "minimumCharge": 240,
        "taxRate": 0,
        "depositPercent": 25
      },
      "addOns": [
        {
          "id": "piano",
          "label": "Piano Move",
          "price": 250
        },
        {
          "id": "gunSafe",
          "label": "Gun Safe/Heavy Item",
          "price": 150
        },
        {
          "id": "unpacking",
          "label": "Unpacking Service",
          "price": 200
        }
      ],
      "calculation": "(crewSize == '2 Men' ? rate2men : crewSize == '3 Men' ? rate3men : rate4men) * Math.max(hours || minimumHours, minimumHours) * (moveType == 'Long Distance' ? longDistanceRate : 1) + (flights == '1 Flight' ? stairFee : flights == '2 Flights' ? stairFee * 2 : flights == '3+ Flights' ? stairFee * 3 : 0) + (packing ? packingRate * Math.max(hours || minimumHours, minimumHours) : 0) + travelFee",
      "summaryLines": [
        {
          "label": "{crewSize} crew ({hours} hrs)",
          "value": "(crewSize == '2 Men' ? rate2men : crewSize == '3 Men' ? rate3men : rate4men) * Math.max(hours || minimumHours, minimumHours)"
        },
        {
          "label": "Stair fee",
          "value": "flights == '1 Flight' ? stairFee : flights == '2 Flights' ? stairFee * 2 : stairFee * 3",
          "showIf": "flights != 'None'"
        },
        {
          "label": "Packing service",
          "value": "packingRate * Math.max(hours || minimumHours, minimumHours)",
          "showIf": "packing == true"
        },
        {
          "label": "Travel fee",
          "value": "travelFee"
        }
      ]
    }
  },
  {
    "name": "Pinnacle Deck Builders",
    "trade": "Deck Building",
    "color": "#5C4033",
    "emoji": "🏗️",
    "tagline": "Built to last. Built for life.",
    "phone": "(330) 555-0111",
    "schema": {
      "trade": "Deck Building",
      "fields": [
        {
          "id": "deckSqft",
          "label": "Deck Square Footage",
          "type": "number",
          "placeholder": "Total square footage",
          "unit": "sqft",
          "group": "dimensions"
        },
        {
          "id": "material",
          "label": "Decking Material",
          "type": "selector",
          "options": [
            "Pressure Treated",
            "Composite (Trex/TimberTech)",
            "Cedar",
            "Hardwood (Ipe)"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "railingLinearFt",
          "label": "Railing (linear feet)",
          "type": "number",
          "placeholder": "Linear feet of railing",
          "unit": "lf",
          "group": "railings"
        },
        {
          "id": "demoRequired",
          "label": "Demo/Teardown of Existing",
          "type": "toggle",
          "unit": "flat",
          "group": "fees"
        },
        {
          "id": "permitHandling",
          "label": "We Handle Permits",
          "type": "toggle",
          "unit": "flat",
          "group": "fees"
        }
      ],
      "pricing": {
        "ptRate": 18,
        "compositeRate": 32,
        "cedarRate": 26,
        "hardwoodRate": 45,
        "railingPT": 28,
        "railingComposite": 45,
        "railingCedar": 38,
        "railingHardwood": 60,
        "demoRate": 5,
        "permitFee": 350,
        "minimumCharge": 2500,
        "taxRate": 0,
        "depositPercent": 30
      },
      "addOns": [
        {
          "id": "stairs",
          "label": "Stairs (per step)",
          "price": 85
        },
        {
          "id": "pergola",
          "label": "Pergola/Shade Structure",
          "price": 1800
        },
        {
          "id": "builtInSeating",
          "label": "Built-In Seating",
          "price": 650
        },
        {
          "id": "lighting",
          "label": "Deck Lighting Package",
          "price": 450
        }
      ],
      "calculation": "(deckSqft || 0) * (material == 'Pressure Treated' ? ptRate : material == 'Composite (Trex/TimberTech)' ? compositeRate : material == 'Cedar' ? cedarRate : hardwoodRate) + (railingLinearFt || 0) * (material == 'Pressure Treated' ? railingPT : material == 'Composite (Trex/TimberTech)' ? railingComposite : material == 'Cedar' ? railingCedar : railingHardwood) + (demoRequired ? (deckSqft || 0) * demoRate : 0) + (permitHandling ? permitFee : 0)",
      "summaryLines": [
        {
          "label": "Decking ({deckSqft} sqft — {material})",
          "value": "(deckSqft || 0) * (material == 'Pressure Treated' ? ptRate : material == 'Composite (Trex/TimberTech)' ? compositeRate : material == 'Cedar' ? cedarRate : hardwoodRate)"
        },
        {
          "label": "Railing ({railingLinearFt} linear ft)",
          "value": "(railingLinearFt || 0) * (material == 'Pressure Treated' ? railingPT : material == 'Composite (Trex/TimberTech)' ? railingComposite : material == 'Cedar' ? railingCedar : railingHardwood)",
          "showIf": "railingLinearFt > 0"
        },
        {
          "label": "Demo and teardown",
          "value": "(deckSqft || 0) * demoRate",
          "showIf": "demoRequired == true"
        },
        {
          "label": "Permit handling",
          "value": "permitFee",
          "showIf": "permitHandling == true"
        }
      ]
    }
  },
  {
    "name": "ColorPro Painting",
    "trade": "Painting",
    "color": "#C1121F",
    "emoji": "🎨",
    "tagline": "Your vision. Our brush.",
    "phone": "(330) 555-0112",
    "schema": {
      "trade": "Painting",
      "fields": [
        {
          "id": "paintType",
          "label": "Interior or Exterior",
          "type": "selector",
          "options": [
            "Interior",
            "Exterior"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "rooms",
          "label": "Number of Rooms (interior)",
          "type": "number",
          "placeholder": "Number of rooms",
          "unit": "room",
          "group": "dimensions"
        },
        {
          "id": "sqft",
          "label": "Square Footage (exterior)",
          "type": "number",
          "placeholder": "Exterior square footage",
          "unit": "sqft",
          "group": "dimensions"
        },
        {
          "id": "coats",
          "label": "Number of Coats",
          "type": "selector",
          "options": [
            "1 Coat",
            "2 Coats"
          ],
          "unit": "flat",
          "group": "dimensions"
        },
        {
          "id": "ceilings",
          "label": "Ceilings Included",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        },
        {
          "id": "trim",
          "label": "Trim and Baseboards",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "interiorPerRoom": 300,
        "exteriorPerSqft": 2.5,
        "secondCoatUpcharge": 0.4,
        "ceilingPerRoom": 75,
        "trimPerRoom": 85,
        "minimumCharge": 300,
        "taxRate": 0,
        "depositPercent": 33
      },
      "addOns": [
        {
          "id": "cabinetPainting",
          "label": "Cabinet Painting",
          "price": 850
        },
        {
          "id": "deckStain",
          "label": "Deck Staining",
          "price": 450
        },
        {
          "id": "priming",
          "label": "Primer Coat",
          "price": 200
        }
      ],
      "calculation": "paintType == 'Interior' ? (rooms || 0) * interiorPerRoom * (coats == '2 Coats' ? 1 + secondCoatUpcharge : 1) + (ceilings ? (rooms || 0) * ceilingPerRoom : 0) + (trim ? (rooms || 0) * trimPerRoom : 0) : (sqft || 0) * exteriorPerSqft * (coats == '2 Coats' ? 1 + secondCoatUpcharge : 1)",
      "summaryLines": [
        {
          "label": "Interior paint ({rooms} rooms)",
          "value": "(rooms || 0) * interiorPerRoom",
          "showIf": "paintType == 'Interior'"
        },
        {
          "label": "Exterior paint ({sqft} sqft)",
          "value": "(sqft || 0) * exteriorPerSqft",
          "showIf": "paintType == 'Exterior'"
        },
        {
          "label": "Second coat",
          "value": "paintType == 'Interior' ? (rooms || 0) * interiorPerRoom * secondCoatUpcharge : (sqft || 0) * exteriorPerSqft * secondCoatUpcharge",
          "showIf": "coats == '2 Coats'"
        },
        {
          "label": "Ceilings",
          "value": "(rooms || 0) * ceilingPerRoom",
          "showIf": "ceilings == true"
        },
        {
          "label": "Trim and baseboards",
          "value": "(rooms || 0) * trimPerRoom",
          "showIf": "trim == true"
        }
      ]
    }
  },
  {
    "name": "Guardian Pest Control",
    "trade": "Pest Control",
    "color": "#4A4E69",
    "emoji": "🛡️",
    "tagline": "Protect what matters.",
    "phone": "(330) 555-0113",
    "schema": {
      "trade": "Pest Control",
      "fields": [
        {
          "id": "serviceType",
          "label": "Service Type",
          "type": "selector",
          "options": [
            "Initial Treatment",
            "Recurring Quarterly",
            "One-Time Visit"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "pestType",
          "label": "Primary Pest",
          "type": "selector",
          "options": [
            "General Pest",
            "Termite",
            "Mosquito",
            "Rodent",
            "Bed Bug",
            "Ant/Spider"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "homeSize",
          "label": "Home Size",
          "type": "selector",
          "options": [
            "Under 1,500 sqft",
            "1,500-2,500 sqft",
            "2,500-4,000 sqft",
            "Over 4,000 sqft"
          ],
          "unit": "flat",
          "group": "dimensions"
        }
      ],
      "pricing": {
        "initialSmall": 175,
        "initialMedium": 225,
        "initialLarge": 275,
        "initialXL": 350,
        "recurringSmall": 65,
        "recurringMedium": 85,
        "recurringLarge": 110,
        "recurringXL": 135,
        "oneTimeSmall": 135,
        "oneTimeMedium": 175,
        "oneTimeLarge": 220,
        "oneTimeXL": 275,
        "termiteUpcharge": 150,
        "bedBugUpcharge": 200,
        "minimumCharge": 135,
        "taxRate": 0,
        "depositPercent": 0
      },
      "addOns": [
        {
          "id": "attic",
          "label": "Attic Treatment",
          "price": 95
        },
        {
          "id": "crawlSpace",
          "label": "Crawl Space Treatment",
          "price": 85
        },
        {
          "id": "garage",
          "label": "Garage Treatment",
          "price": 55
        }
      ],
      "calculation": "(homeSize == 'Under 1,500 sqft' ? (serviceType == 'Initial Treatment' ? initialSmall : serviceType == 'Recurring Quarterly' ? recurringSmall : oneTimeSmall) : homeSize == '1,500-2,500 sqft' ? (serviceType == 'Initial Treatment' ? initialMedium : serviceType == 'Recurring Quarterly' ? recurringMedium : oneTimeMedium) : homeSize == '2,500-4,000 sqft' ? (serviceType == 'Initial Treatment' ? initialLarge : serviceType == 'Recurring Quarterly' ? recurringLarge : oneTimeLarge) : (serviceType == 'Initial Treatment' ? initialXL : serviceType == 'Recurring Quarterly' ? recurringXL : oneTimeXL)) + (pestType == 'Termite' ? termiteUpcharge : pestType == 'Bed Bug' ? bedBugUpcharge : 0)",
      "summaryLines": [
        {
          "label": "{serviceType} — {homeSize}",
          "value": "homeSize == 'Under 1,500 sqft' ? (serviceType == 'Initial Treatment' ? initialSmall : serviceType == 'Recurring Quarterly' ? recurringSmall : oneTimeSmall) : homeSize == '1,500-2,500 sqft' ? (serviceType == 'Initial Treatment' ? initialMedium : serviceType == 'Recurring Quarterly' ? recurringMedium : oneTimeMedium) : homeSize == '2,500-4,000 sqft' ? (serviceType == 'Initial Treatment' ? initialLarge : serviceType == 'Recurring Quarterly' ? recurringLarge : oneTimeLarge) : (serviceType == 'Initial Treatment' ? initialXL : serviceType == 'Recurring Quarterly' ? recurringXL : oneTimeXL)"
        },
        {
          "label": "Termite treatment",
          "value": "termiteUpcharge",
          "showIf": "pestType == 'Termite'"
        },
        {
          "label": "Bed bug treatment",
          "value": "bedBugUpcharge",
          "showIf": "pestType == 'Bed Bug'"
        }
      ]
    }
  },
  {
    "name": "FreshStart Carpet Cleaning",
    "trade": "Carpet Cleaning",
    "color": "#457B9D",
    "emoji": "🧹",
    "tagline": "Fresh from the floor up.",
    "phone": "(330) 555-0114",
    "schema": {
      "trade": "Carpet Cleaning",
      "fields": [
        {
          "id": "rooms",
          "label": "Number of Rooms/Areas",
          "type": "number",
          "placeholder": "How many rooms?",
          "unit": "room",
          "group": "dimensions"
        },
        {
          "id": "cleanMethod",
          "label": "Clean Method",
          "type": "selector",
          "options": [
            "Hot Water Extraction (Steam)",
            "Dry Clean"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "heavyStains",
          "label": "Heavy Stains/Pet Damage",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        },
        {
          "id": "protector",
          "label": "Carpet Protector Applied",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "steamPerRoom": 45,
        "dryPerRoom": 55,
        "stainTreatment": 25,
        "protectorPerRoom": 15,
        "minimumCharge": 90,
        "taxRate": 0,
        "depositPercent": 0
      },
      "addOns": [
        {
          "id": "upholstery",
          "label": "Upholstery Cleaning",
          "price": 85
        },
        {
          "id": "areaRug",
          "label": "Area Rug (each)",
          "price": 65
        },
        {
          "id": "petOdor",
          "label": "Pet Odor Treatment",
          "price": 55
        }
      ],
      "calculation": "(rooms || 1) * (cleanMethod == 'Hot Water Extraction (Steam)' ? steamPerRoom : dryPerRoom) + (heavyStains ? (rooms || 1) * stainTreatment : 0) + (protector ? (rooms || 1) * protectorPerRoom : 0)",
      "summaryLines": [
        {
          "label": "{cleanMethod} — {rooms} rooms",
          "value": "(rooms || 1) * (cleanMethod == 'Hot Water Extraction (Steam)' ? steamPerRoom : dryPerRoom)"
        },
        {
          "label": "Stain/pet treatment",
          "value": "(rooms || 1) * stainTreatment",
          "showIf": "heavyStains == true"
        },
        {
          "label": "Carpet protector",
          "value": "(rooms || 1) * protectorPerRoom",
          "showIf": "protector == true"
        }
      ]
    }
  },
  {
    "name": "Apex Roofing",
    "trade": "Roofing",
    "color": "#6C757D",
    "emoji": "🏚️",
    "tagline": "Top to bottom protection.",
    "phone": "(330) 555-0115",
    "schema": {
      "trade": "Roofing",
      "fields": [
        {
          "id": "squares",
          "label": "Roof Squares (100 sqft each)",
          "type": "number",
          "placeholder": "Number of squares",
          "unit": "each",
          "group": "dimensions"
        },
        {
          "id": "material",
          "label": "Shingle Material",
          "type": "selector",
          "options": [
            "3-Tab Asphalt",
            "Architectural Shingle",
            "Premium Architectural",
            "Metal Roofing"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "stories",
          "label": "Stories",
          "type": "selector",
          "options": [
            "1 Story",
            "2 Story",
            "3+ Story"
          ],
          "unit": "flat",
          "group": "dimensions"
        },
        {
          "id": "tearOff",
          "label": "Tear Off Old Roof",
          "type": "toggle",
          "unit": "flat",
          "group": "fees"
        },
        {
          "id": "iceWater",
          "label": "Ice and Water Shield",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "tab3Rate": 350,
        "architecturalRate": 450,
        "premiumRate": 600,
        "metalRate": 900,
        "tearOffRate": 75,
        "story2Upcharge": 25,
        "story3Upcharge": 50,
        "iceWaterRate": 50,
        "minimumCharge": 1500,
        "taxRate": 0,
        "depositPercent": 40
      },
      "addOns": [
        {
          "id": "gutters",
          "label": "Gutter Installation",
          "price": 1200
        },
        {
          "id": "skylightFlash",
          "label": "Skylight Reflashing",
          "price": 350
        },
        {
          "id": "inspection",
          "label": "Roof Inspection Report",
          "price": 150
        }
      ],
      "calculation": "(squares || 0) * (material == '3-Tab Asphalt' ? tab3Rate : material == 'Architectural Shingle' ? architecturalRate : material == 'Premium Architectural' ? premiumRate : metalRate) + (tearOff ? (squares || 0) * tearOffRate : 0) + (stories == '2 Story' ? (squares || 0) * story2Upcharge : stories == '3+ Story' ? (squares || 0) * story3Upcharge : 0) + (iceWater ? (squares || 0) * iceWaterRate : 0)",
      "summaryLines": [
        {
          "label": "{material} — {squares} squares",
          "value": "(squares || 0) * (material == '3-Tab Asphalt' ? tab3Rate : material == 'Architectural Shingle' ? architecturalRate : material == 'Premium Architectural' ? premiumRate : metalRate)"
        },
        {
          "label": "Tear off old roof",
          "value": "(squares || 0) * tearOffRate",
          "showIf": "tearOff == true"
        },
        {
          "label": "2-story surcharge",
          "value": "(squares || 0) * story2Upcharge",
          "showIf": "stories == '2 Story'"
        },
        {
          "label": "3-story surcharge",
          "value": "(squares || 0) * story3Upcharge",
          "showIf": "stories == '3+ Story'"
        },
        {
          "label": "Ice and water shield",
          "value": "(squares || 0) * iceWaterRate",
          "showIf": "iceWater == true"
        }
      ]
    }
  },
  {
    "name": "ComfortZone HVAC",
    "trade": "HVAC",
    "color": "#0077B6",
    "emoji": "❄️",
    "tagline": "Year-round comfort.",
    "phone": "(330) 555-0116",
    "schema": {
      "trade": "HVAC",
      "fields": [
        {
          "id": "serviceType",
          "label": "Service Type",
          "type": "selector",
          "options": [
            "Tune-Up/Maintenance",
            "Diagnostic/Repair",
            "New System Install",
            "Duct Cleaning"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "systemType",
          "label": "System Type",
          "type": "selector",
          "options": [
            "Central AC",
            "Furnace",
            "Heat Pump",
            "Mini-Split"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "tonnage",
          "label": "System Tonnage (for install)",
          "type": "selector",
          "options": [
            "1.5 Ton",
            "2 Ton",
            "2.5 Ton",
            "3 Ton",
            "4 Ton",
            "5 Ton"
          ],
          "unit": "ton",
          "group": "dimensions"
        },
        {
          "id": "emergency",
          "label": "Emergency/After Hours",
          "type": "toggle",
          "unit": "flat",
          "group": "fees"
        }
      ],
      "pricing": {
        "tuneUpRate": 95,
        "diagnosticRate": 125,
        "install15ton": 3200,
        "install2ton": 3800,
        "install25ton": 4400,
        "install3ton": 5000,
        "install4ton": 6200,
        "install5ton": 7500,
        "ductCleaning": 350,
        "emergencyMultiplier": 1.5,
        "serviceCallFee": 75,
        "minimumCharge": 95,
        "taxRate": 0,
        "depositPercent": 50
      },
      "addOns": [
        {
          "id": "airScrubber",
          "label": "Air Scrubber/Purifier",
          "price": 850
        },
        {
          "id": "thermostat",
          "label": "Smart Thermostat Install",
          "price": 250
        },
        {
          "id": "maintenance",
          "label": "Annual Maintenance Plan",
          "price": 180
        }
      ],
      "calculation": "serviceCallFee + (serviceType == 'Tune-Up/Maintenance' ? tuneUpRate : serviceType == 'Diagnostic/Repair' ? diagnosticRate : serviceType == 'Duct Cleaning' ? ductCleaning : tonnage == '1.5 Ton' ? install15ton : tonnage == '2 Ton' ? install2ton : tonnage == '2.5 Ton' ? install25ton : tonnage == '3 Ton' ? install3ton : tonnage == '4 Ton' ? install4ton : install5ton) * (emergency ? emergencyMultiplier : 1)",
      "summaryLines": [
        {
          "label": "Service call fee",
          "value": "serviceCallFee"
        },
        {
          "label": "{serviceType}",
          "value": "serviceType == 'Tune-Up/Maintenance' ? tuneUpRate : serviceType == 'Diagnostic/Repair' ? diagnosticRate : serviceType == 'Duct Cleaning' ? ductCleaning : tonnage == '1.5 Ton' ? install15ton : tonnage == '2 Ton' ? install2ton : tonnage == '2.5 Ton' ? install25ton : tonnage == '3 Ton' ? install3ton : tonnage == '4 Ton' ? install4ton : install5ton"
        }
      ]
    }
  },
  {
    "name": "SecurePerimeter Fence",
    "trade": "Fence Installation",
    "color": "#8B5E3C",
    "emoji": "🏡",
    "tagline": "Your property. Protected.",
    "phone": "(330) 555-0117",
    "schema": {
      "trade": "Fence Installation",
      "fields": [
        {
          "id": "linearFeet",
          "label": "Linear Feet of Fence",
          "type": "number",
          "placeholder": "Total linear feet",
          "unit": "lf",
          "group": "fencing"
        },
        {
          "id": "material",
          "label": "Fence Material",
          "type": "selector",
          "options": [
            "Wood Privacy",
            "Wood Picket",
            "Vinyl",
            "Chain Link",
            "Aluminum",
            "Split Rail"
          ],
          "unit": "flat",
          "group": "fencing"
        },
        {
          "id": "gates",
          "label": "Number of Gates",
          "type": "number",
          "placeholder": "How many gates?",
          "unit": "each",
          "group": "dimensions"
        },
        {
          "id": "demoRequired",
          "label": "Remove Old Fence",
          "type": "toggle",
          "unit": "flat",
          "group": "fencing"
        }
      ],
      "pricing": {
        "woodPrivacyRate": 28,
        "woodPicketRate": 22,
        "vinylRate": 35,
        "chainLinkRate": 18,
        "aluminumRate": 32,
        "splitRailRate": 16,
        "woodGate": 250,
        "vinylGate": 350,
        "chainGate": 200,
        "aluminumGate": 300,
        "demoRate": 5,
        "minimumCharge": 800,
        "taxRate": 0,
        "depositPercent": 33
      },
      "addOns": [
        {
          "id": "postCaps",
          "label": "Decorative Post Caps",
          "price": 150
        },
        {
          "id": "concreteFootings",
          "label": "Concrete Footings Upgrade",
          "price": 350
        }
      ],
      "calculation": "(linearFeet || 0) * (material == 'Wood Privacy' ? woodPrivacyRate : material == 'Wood Picket' ? woodPicketRate : material == 'Vinyl' ? vinylRate : material == 'Chain Link' ? chainLinkRate : material == 'Aluminum' ? aluminumRate : splitRailRate) + (gates || 0) * (material == 'Vinyl' ? vinylGate : material == 'Chain Link' ? chainGate : material == 'Aluminum' ? aluminumGate : woodGate) + (demoRequired ? (linearFeet || 0) * demoRate : 0)",
      "summaryLines": [
        {
          "label": "{material} fence ({linearFeet} linear ft)",
          "value": "(linearFeet || 0) * (material == 'Wood Privacy' ? woodPrivacyRate : material == 'Wood Picket' ? woodPicketRate : material == 'Vinyl' ? vinylRate : material == 'Chain Link' ? chainLinkRate : material == 'Aluminum' ? aluminumRate : splitRailRate)"
        },
        {
          "label": "Gates ({gates})",
          "value": "(gates || 0) * (material == 'Vinyl' ? vinylGate : material == 'Chain Link' ? chainGate : material == 'Aluminum' ? aluminumGate : woodGate)",
          "showIf": "gates > 0"
        },
        {
          "label": "Remove old fence",
          "value": "(linearFeet || 0) * demoRate",
          "showIf": "demoRequired == true"
        }
      ]
    }
  },
  {
    "name": "AquaClear Pool Service",
    "trade": "Pool Service",
    "color": "#00B4D8",
    "emoji": "🏊",
    "tagline": "Crystal clear. Every time.",
    "phone": "(330) 555-0118",
    "schema": {
      "trade": "Pool Service",
      "fields": [
        {
          "id": "serviceType",
          "label": "Service Type",
          "type": "selector",
          "options": [
            "Weekly Maintenance",
            "Opening (Spring)",
            "Closing (Winter)",
            "One-Time Clean"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "poolSize",
          "label": "Pool Size",
          "type": "selector",
          "options": [
            "Small (under 15,000 gal)",
            "Medium (15,000-25,000 gal)",
            "Large (over 25,000 gal)"
          ],
          "unit": "flat",
          "group": "dimensions"
        },
        {
          "id": "chemicalsIncluded",
          "label": "Chemicals Included",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "weeklySmall": 95,
        "weeklyMedium": 125,
        "weeklyLarge": 165,
        "openingSmall": 250,
        "openingMedium": 325,
        "openingLarge": 425,
        "closingSmall": 225,
        "closingMedium": 300,
        "closingLarge": 395,
        "oneTimeSmall": 175,
        "oneTimeMedium": 225,
        "oneTimeLarge": 295,
        "chemicalMarkup": 45,
        "minimumCharge": 95,
        "taxRate": 0,
        "depositPercent": 0
      },
      "addOns": [
        {
          "id": "filterClean",
          "label": "Filter Deep Clean",
          "price": 85
        },
        {
          "id": "algaeTreatment",
          "label": "Algae Shock Treatment",
          "price": 120
        },
        {
          "id": "leakTest",
          "label": "Leak Detection Test",
          "price": 175
        }
      ],
      "calculation": "(poolSize == 'Small (under 15,000 gal)' ? (serviceType == 'Weekly Maintenance' ? weeklySmall : serviceType == 'Opening (Spring)' ? openingSmall : serviceType == 'Closing (Winter)' ? closingSmall : oneTimeSmall) : poolSize == 'Medium (15,000-25,000 gal)' ? (serviceType == 'Weekly Maintenance' ? weeklyMedium : serviceType == 'Opening (Spring)' ? openingMedium : serviceType == 'Closing (Winter)' ? closingMedium : oneTimeMedium) : (serviceType == 'Weekly Maintenance' ? weeklyLarge : serviceType == 'Opening (Spring)' ? openingLarge : serviceType == 'Closing (Winter)' ? closingLarge : oneTimeLarge)) + (chemicalsIncluded ? chemicalMarkup : 0)",
      "summaryLines": [
        {
          "label": "{serviceType} — {poolSize}",
          "value": "poolSize == 'Small (under 15,000 gal)' ? (serviceType == 'Weekly Maintenance' ? weeklySmall : serviceType == 'Opening (Spring)' ? openingSmall : serviceType == 'Closing (Winter)' ? closingSmall : oneTimeSmall) : poolSize == 'Medium (15,000-25,000 gal)' ? (serviceType == 'Weekly Maintenance' ? weeklyMedium : serviceType == 'Opening (Spring)' ? openingMedium : serviceType == 'Closing (Winter)' ? closingMedium : oneTimeMedium) : (serviceType == 'Weekly Maintenance' ? weeklyLarge : serviceType == 'Opening (Spring)' ? openingLarge : serviceType == 'Closing (Winter)' ? closingLarge : oneTimeLarge)"
        },
        {
          "label": "Chemicals included",
          "value": "chemicalMarkup",
          "showIf": "chemicalsIncluded == true"
        }
      ]
    }
  },
  {
    "name": "LandCraft Landscaping",
    "trade": "Landscaping",
    "color": "#588157",
    "emoji": "🌱",
    "tagline": "Landscapes that last.",
    "phone": "(330) 555-0119",
    "schema": {
      "trade": "Landscaping",
      "fields": [
        {
          "id": "projectType",
          "label": "Project Type",
          "type": "selector",
          "options": [
            "Mulching",
            "Planting/Beds",
            "Sod Installation",
            "Retaining Wall",
            "Seasonal Cleanup"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "sqft",
          "label": "Area Square Footage",
          "type": "number",
          "placeholder": "Approx. square footage",
          "unit": "sqft",
          "group": "dimensions"
        },
        {
          "id": "yardsOfMaterial",
          "label": "Yards of Material Needed",
          "type": "number",
          "placeholder": "Cubic yards",
          "unit": "each",
          "group": "dimensions"
        },
        {
          "id": "designIncluded",
          "label": "Design Consultation",
          "type": "toggle",
          "unit": "flat",
          "group": "extras"
        }
      ],
      "pricing": {
        "mulchRate": 0.75,
        "plantingRate": 1.2,
        "sodRate": 1.5,
        "retainingWallRate": 4.5,
        "cleanupRate": 0.8,
        "laborRate": 65,
        "designFee": 250,
        "minimumCharge": 250,
        "taxRate": 0,
        "depositPercent": 33
      },
      "addOns": [
        {
          "id": "irrigation",
          "label": "Irrigation Check/Install",
          "price": 350
        },
        {
          "id": "annuals",
          "label": "Annual Color Planting",
          "price": 185
        },
        {
          "id": "lighting",
          "label": "Landscape Lighting",
          "price": 450
        }
      ],
      "calculation": "(sqft || 0) * (projectType == 'Mulching' ? mulchRate : projectType == 'Planting/Beds' ? plantingRate : projectType == 'Sod Installation' ? sodRate : projectType == 'Retaining Wall' ? retainingWallRate : cleanupRate) + (yardsOfMaterial || 0) * laborRate + (designIncluded ? designFee : 0)",
      "summaryLines": [
        {
          "label": "{projectType} ({sqft} sqft)",
          "value": "(sqft || 0) * (projectType == 'Mulching' ? mulchRate : projectType == 'Planting/Beds' ? plantingRate : projectType == 'Sod Installation' ? sodRate : projectType == 'Retaining Wall' ? retainingWallRate : cleanupRate)"
        },
        {
          "label": "Materials and install ({yardsOfMaterial} yds)",
          "value": "(yardsOfMaterial || 0) * laborRate",
          "showIf": "yardsOfMaterial > 0"
        },
        {
          "label": "Design consultation",
          "value": "designFee",
          "showIf": "designIncluded == true"
        }
      ]
    }
  },
  {
    "name": "PrimePlumb Plumbing",
    "trade": "Plumbing",
    "color": "#1B4332",
    "emoji": "🔧",
    "tagline": "Flow with confidence.",
    "phone": "(330) 555-0120",
    "schema": {
      "trade": "Plumbing",
      "fields": [
        {
          "id": "serviceType",
          "label": "Service Type",
          "type": "selector",
          "options": [
            "Diagnostic/Service Call",
            "Drain Cleaning",
            "Fixture Install",
            "Water Heater",
            "Leak Repair",
            "Remodel Rough-In"
          ],
          "unit": "flat",
          "group": "materials"
        },
        {
          "id": "fixtureCount",
          "label": "Number of Fixtures",
          "type": "number",
          "placeholder": "How many fixtures?",
          "unit": "each",
          "group": "dimensions"
        },
        {
          "id": "hours",
          "label": "Estimated Labor Hours",
          "type": "number",
          "placeholder": "Estimated hours",
          "unit": "hr",
          "group": "dimensions"
        },
        {
          "id": "emergency",
          "label": "Emergency/After Hours",
          "type": "toggle",
          "unit": "flat",
          "group": "fees"
        }
      ],
      "pricing": {
        "serviceCallFee": 95,
        "drainCleaning": 175,
        "fixtureInstall": 145,
        "waterHeater": 950,
        "leakRepair": 225,
        "roughInPerFixture": 285,
        "hourlyRate": 110,
        "emergencyMultiplier": 1.5,
        "minimumCharge": 95,
        "taxRate": 0,
        "depositPercent": 0
      },
      "addOns": [
        {
          "id": "cameraInspect",
          "label": "Camera Line Inspection",
          "price": 250
        },
        {
          "id": "waterSoftener",
          "label": "Water Softener Install",
          "price": 650
        },
        {
          "id": "shutoffs",
          "label": "Shutoff Valve Replacement",
          "price": 95
        }
      ],
      "calculation": "serviceCallFee + (serviceType == 'Drain Cleaning' ? drainCleaning : serviceType == 'Fixture Install' ? (fixtureCount || 1) * fixtureInstall : serviceType == 'Water Heater' ? waterHeater : serviceType == 'Leak Repair' ? leakRepair : serviceType == 'Remodel Rough-In' ? (fixtureCount || 1) * roughInPerFixture : (hours || 1) * hourlyRate) * (emergency ? emergencyMultiplier : 1)",
      "summaryLines": [
        {
          "label": "Service call fee",
          "value": "serviceCallFee"
        },
        {
          "label": "{serviceType}",
          "value": "serviceType == 'Drain Cleaning' ? drainCleaning : serviceType == 'Fixture Install' ? (fixtureCount || 1) * fixtureInstall : serviceType == 'Water Heater' ? waterHeater : serviceType == 'Leak Repair' ? leakRepair : serviceType == 'Remodel Rough-In' ? (fixtureCount || 1) * roughInPerFixture : (hours || 1) * hourlyRate"
        }
      ]
    }
  }
];
