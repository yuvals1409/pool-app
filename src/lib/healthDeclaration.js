export function parseHealthDeclarationPath() {
  if (window.location.pathname.match(/\/health-declaration\/?$/i)) {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("form") === "health-declaration";
}
