import { COUNTRIES } from './src/data/countries';

function runValidation() {
  console.log(`Validating ${COUNTRIES.length} countries...`);

  if (COUNTRIES.length !== 195) {
    console.error(`FAIL: Expected 195 countries, got ${COUNTRIES.length}`);
    process.exit(1);
  }

  const iso2Set = new Set();
  const iso3Set = new Set();
  const nameSet = new Set();

  let failed = false;

  for (const c of COUNTRIES) {
    if (iso2Set.has(c.iso2)) {
      console.error(`FAIL: Duplicate ISO2 code: ${c.iso2}`);
      failed = true;
    }
    iso2Set.add(c.iso2);

    if (iso3Set.has(c.iso3)) {
      console.error(`FAIL: Duplicate ISO3 code: ${c.iso3}`);
      failed = true;
    }
    iso3Set.add(c.iso3);

    if (nameSet.has(c.name)) {
      console.error(`FAIL: Duplicate name: ${c.name}`);
      failed = true;
    }
    nameSet.add(c.name);

    if (!c.name || !c.iso2 || !c.iso3 || !c.dialCode || !c.currencyCode) {
       console.error(`FAIL: Missing essential data for country: ${c.name || c.iso2}`);
       failed = true;
    }
  }

  if (failed) {
    console.error("FAIL: Validation completed with errors.");
    process.exit(1);
  }

  console.log("PASS: All validations passed.");
}

runValidation();
