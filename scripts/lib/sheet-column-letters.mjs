/** 0-based column index → A, B, …, Z, AA, … */
export function colLetter(index) {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export function colLetters(headers) {
  return Object.fromEntries(headers.map((h, i) => [h, colLetter(i)]));
}
