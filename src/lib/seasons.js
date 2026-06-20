/** Swimming school year: 1 Sep through 1 Sep of the following calendar year. */
export const SWIMMING_SEASON_START_MONTH = 9;
export const SWIMMING_SEASON_START_DAY = 1;

export function swimmingSeasonStartYear(asOf = new Date()) {
  const d = asOf instanceof Date ? asOf : new Date(asOf);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if (month < SWIMMING_SEASON_START_MONTH
    || (month === SWIMMING_SEASON_START_MONTH && day < SWIMMING_SEASON_START_DAY)) {
    return year - 1;
  }
  return year;
}

export function swimmingSeasonName(startYear) {
  const endShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}/${endShort}`;
}

export function swimmingSeasonBounds(startYear) {
  return {
    start_date: `${startYear}-09-01`,
    end_date: `${startYear + 1}-09-01`,
  };
}

export function isSummerSeasonName(name) {
  return typeof name === "string" && (name.includes("קיץ") || /^summer/i.test(name));
}
