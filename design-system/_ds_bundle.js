/* @ds-bundle: {"format":3,"namespace":"StreamLineDesignSystem_132b60","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"KpiCard","sourcePath":"components/core/Card.jsx"},{"name":"Field","sourcePath":"components/core/Input.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Textarea","sourcePath":"components/core/Input.jsx"},{"name":"Select","sourcePath":"components/core/Input.jsx"},{"name":"SegmentedControl","sourcePath":"components/core/SegmentedControl.jsx"},{"name":"Spinner","sourcePath":"components/core/Spinner.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"Checkbox","sourcePath":"components/core/Switch.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"NavItem","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"Sidebar","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"NavSection","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"TopBar","sourcePath":"components/navigation/TopBar.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"feb59f387718","components/core/Badge.jsx":"b08b7bc68f61","components/core/Button.jsx":"d674b8d41089","components/core/Card.jsx":"9d703cce6417","components/core/Input.jsx":"f63c4e7822dc","components/core/SegmentedControl.jsx":"a28ad5b83b84","components/core/Spinner.jsx":"e2ccbb3e277e","components/core/Switch.jsx":"bf0905e410c1","components/feedback/EmptyState.jsx":"f141f734a7af","components/feedback/Toast.jsx":"2c5bf58af4a7","components/navigation/Sidebar.jsx":"a3c559bd8c5e","components/navigation/TopBar.jsx":"c073ba276205","ui_kits/workspace/Dashboard.jsx":"93ffafb2853e","ui_kits/workspace/Enrollments.jsx":"24c465d4083f","ui_kits/workspace/Schedule.jsx":"a85e3929f4b8","ui_kits/workspace/data.js":"6936c8a8c616"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.StreamLineDesignSystem_132b60 = window.StreamLineDesignSystem_132b60 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const PALETTE = ["#0077B6", "#2E9E6B", "#6C5CE7", "#E8722E", "#0984E3", "#C9881E", "#8E7CFF", "#15B4AC"];
function hueFor(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = h * 31 + name.charCodeAt(i) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/**
 * Stream Line — Avatar
 * Circular. Image if provided, else deterministic colored initials.
 */
function Avatar({
  name = "",
  src = null,
  size = 32,
  color = null,
  style = {},
  ...rest
}) {
  const bg = color || hueFor(name);
  return /*#__PURE__*/React.createElement("span", _extends({
    title: name,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      flex: "none",
      borderRadius: "var(--radius-pill)",
      background: src ? "var(--surface-sunk)" : bg,
      color: "#fff",
      fontSize: Math.round(size * 0.4),
      fontWeight: "var(--weight-semibold)",
      letterSpacing: "0.01em",
      overflow: "hidden",
      userSelect: "none",
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : initials(name));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Stream Line — Badge
 * Soft-tint status & role pills. Subtle, warm, low-chroma fills.
 */
function Badge({
  children,
  variant = "neutral",
  dot = false,
  style = {},
  ...rest
}) {
  const map = {
    neutral: {
      bg: "var(--badge-neutral-bg)",
      fg: "var(--badge-neutral-fg)"
    },
    success: {
      bg: "var(--success-bg)",
      fg: "var(--success)"
    },
    danger: {
      bg: "var(--danger-bg)",
      fg: "var(--danger)"
    },
    warn: {
      bg: "var(--warn-bg)",
      fg: "var(--warn)"
    },
    info: {
      bg: "var(--info-bg)",
      fg: "var(--info)"
    },
    /* role variants */
    owner: {
      bg: "var(--badge-owner-bg)",
      fg: "var(--badge-owner-fg)"
    },
    admin: {
      bg: "var(--badge-admin-bg)",
      fg: "var(--badge-admin-fg)"
    },
    instructor: {
      bg: "var(--badge-instructor-bg)",
      fg: "var(--badge-instructor-fg)"
    },
    guard: {
      bg: "var(--badge-guard-bg)",
      fg: "var(--badge-guard-fg)"
    },
    office: {
      bg: "var(--badge-office-bg)",
      fg: "var(--badge-office-fg)"
    },
    parent: {
      bg: "var(--badge-parent-bg)",
      fg: "var(--badge-parent-fg)"
    }
  };
  const c = map[variant] || map.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "2px 9px",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--weight-medium)",
      lineHeight: 1.55,
      color: c.fg,
      background: c.bg,
      borderRadius: "var(--radius-pill)",
      letterSpacing: "var(--tracking-tight)",
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), dot ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: "currentColor"
    }
  }) : null, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Stream Line — Button
 * Notion-flat: solid pool-blue primary, bordered white secondary,
 * quiet ghost. Small radius, no gradients, faint press feedback.
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  icon = null,
  iconRight = null,
  fullWidth = false,
  disabled = false,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: {
      padding: "5px 10px",
      fontSize: "13px",
      height: 30,
      gap: 6,
      radius: "var(--radius)"
    },
    md: {
      padding: "7px 14px",
      fontSize: "14px",
      height: 36,
      gap: 7,
      radius: "var(--radius)"
    },
    lg: {
      padding: "10px 18px",
      fontSize: "15px",
      height: 44,
      gap: 8,
      radius: "var(--radius-md)"
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: "var(--pool)",
      color: "var(--on-primary)",
      border: "1px solid var(--pool)"
    },
    secondary: {
      background: "var(--surface)",
      color: "var(--ink)",
      border: "1px solid var(--border-strong)"
    },
    ghost: {
      background: "transparent",
      color: "var(--ink-mid)",
      border: "1px solid transparent"
    },
    danger: {
      background: "var(--danger)",
      color: "var(--on-danger)",
      border: "1px solid var(--danger)"
    },
    success: {
      background: "var(--success)",
      color: "var(--on-success)",
      border: "1px solid var(--success)"
    },
    outline: {
      background: "var(--surface)",
      color: "var(--pool)",
      border: "1px solid var(--pool)"
    }
  };
  const v = variants[variant] || variants.primary;
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const hoverBg = {
    primary: "var(--pool-press)",
    secondary: "var(--surface-hover)",
    ghost: "var(--surface-hover)",
    danger: "#BC3838",
    success: "#268A5C",
    outline: "var(--pool-wash)"
  }[variant];
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: s.gap,
      width: fullWidth ? "100%" : "auto",
      height: s.height,
      padding: s.padding,
      fontSize: s.fontSize,
      fontFamily: "var(--font-sans)",
      fontWeight: "var(--weight-medium)",
      letterSpacing: "var(--tracking-tight)",
      borderRadius: s.radius,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transform: active && !disabled ? "translateY(0.5px)" : "none",
      transition: "background var(--dur-fast) var(--ease-standard), opacity var(--dur-fast)",
      whiteSpace: "nowrap",
      ...v,
      ...(hover && !disabled ? {
        background: hoverBg
      } : {}),
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      marginInlineStart: -2
    }
  }, icon) : null, children, iconRight ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      marginInlineEnd: -2
    }
  }, iconRight) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Stream Line — Card
 * White surface on warm canvas. Border-first (no shadow by default),
 * small radius. The primary container shape.
 */
function Card({
  children,
  padded = true,
  hover = false,
  style = {},
  ...rest
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => hover && setH(true),
    onMouseLeave: () => hover && setH(false),
    style: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: padded ? "var(--pad-card)" : 0,
      transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
      ...(h ? {
        borderColor: "var(--border-strong)",
        boxShadow: "var(--shadow-sm)"
      } : {}),
      ...style
    }
  }, rest), children);
}

/**
 * KpiCard — dashboard metric tile.
 */
function KpiCard({
  label,
  value,
  delta = null,
  deltaUp = true,
  icon = null,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: "16px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-sm)",
      color: "var(--ink-mid)",
      fontWeight: "var(--weight-medium)"
    }
  }, label), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ink-soft)",
      display: "inline-flex"
    }
  }, icon) : null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontVariantNumeric: "tabular-nums",
      fontSize: "28px",
      fontWeight: "var(--weight-semibold)",
      color: "var(--ink)",
      lineHeight: 1.1
    }
  }, value), delta != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-xs)",
      fontWeight: "var(--weight-medium)",
      color: deltaUp ? "var(--success)" : "var(--danger)"
    }
  }, deltaUp ? "▲" : "▼", " ", delta) : null);
}
Object.assign(__ds_scope, { Card, KpiCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Stream Line — Field, Input, Select, Textarea
 * Notion-flat form controls. Label above, 1px border, focus ring.
 */
function Field({
  label,
  hint,
  required = false,
  children,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-sm)",
      fontWeight: "var(--weight-medium)",
      color: "var(--ink-mid)"
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--danger)",
      marginInlineStart: 3
    }
  }, "*") : null) : null, children, hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-xs)",
      color: "var(--ink-soft)"
    }
  }, hint) : null);
}
const baseControl = {
  width: "100%",
  height: 38,
  padding: "0 12px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-base)",
  color: "var(--ink)",
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  outline: "none",
  transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)"
};
function useFocusRing() {
  const [f, setF] = React.useState(false);
  return {
    focused: f,
    bind: {
      onFocus: () => setF(true),
      onBlur: () => setF(false)
    },
    ring: f ? {
      borderColor: "var(--border-focus)",
      boxShadow: "var(--ring)"
    } : {}
  };
}
function Input({
  style = {},
  invalid = false,
  ...rest
}) {
  const {
    bind,
    ring
  } = useFocusRing();
  return /*#__PURE__*/React.createElement("input", _extends({}, bind, {
    style: {
      ...baseControl,
      ...(invalid ? {
        borderColor: "var(--danger)"
      } : {}),
      ...ring,
      ...style
    }
  }, rest));
}
function Textarea({
  style = {},
  rows = 3,
  ...rest
}) {
  const {
    bind,
    ring
  } = useFocusRing();
  return /*#__PURE__*/React.createElement("textarea", _extends({
    rows: rows
  }, bind, {
    style: {
      ...baseControl,
      height: "auto",
      padding: "9px 12px",
      resize: "vertical",
      lineHeight: 1.5,
      ...ring,
      ...style
    }
  }, rest));
}
function Select({
  children,
  style = {},
  ...rest
}) {
  const {
    bind,
    ring
  } = useFocusRing();
  return /*#__PURE__*/React.createElement("select", _extends({}, bind, {
    style: {
      ...baseControl,
      appearance: "none",
      cursor: "pointer",
      backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B675F' stroke-width='2.5'><polyline points='6 9 12 15 18 9'/></svg>\")",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 12px center",
      paddingInlineEnd: 32,
      ...ring,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Field, Input, Textarea, Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/SegmentedControl.jsx
try { (() => {
/**
 * Stream Line — SegmentedControl
 * Inset track, white selected pill. Used for view switches
 * (Day / Week / Month) and filters.
 */
function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  style = {}
}) {
  const pad = size === "sm" ? "5px 12px" : "7px 16px";
  const fs = size === "sm" ? "var(--text-sm)" : "var(--text-base)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      padding: 3,
      gap: 2,
      background: "var(--surface-sunk)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      ...style
    }
  }, options.map(opt => {
    const val = typeof opt === "string" ? opt : opt.value;
    const label = typeof opt === "string" ? opt : opt.label;
    const sel = val === value;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      type: "button",
      onClick: () => onChange && onChange(val),
      style: {
        padding: pad,
        fontSize: fs,
        fontFamily: "var(--font-sans)",
        fontWeight: "var(--weight-medium)",
        letterSpacing: "var(--tracking-tight)",
        border: "none",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        color: sel ? "var(--ink)" : "var(--ink-mid)",
        background: sel ? "var(--surface)" : "transparent",
        boxShadow: sel ? "var(--shadow-xs)" : "none",
        transition: "background var(--dur-fast), color var(--dur-fast)"
      }
    }, label);
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/core/Spinner.jsx
try { (() => {
/**
 * Stream Line — Spinner
 */
function Spinner({
  size = 20,
  color = "var(--pool)",
  style = {}
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      width: size,
      height: size,
      border: `${Math.max(2, Math.round(size / 10))}px solid var(--border-strong)`,
      borderTopColor: color,
      borderRadius: "50%",
      animation: "sl-spin 0.7s linear infinite",
      ...style
    }
  }, /*#__PURE__*/React.createElement("style", null, `@keyframes sl-spin { to { transform: rotate(360deg); } }`));
}
Object.assign(__ds_scope, { Spinner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Spinner.jsx", error: String((e && e.message) || e) }); }

// components/core/Switch.jsx
try { (() => {
/**
 * Stream Line — Switch (toggle)
 */
function Switch({
  checked = false,
  onChange,
  disabled = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "switch",
    "aria-checked": checked,
    disabled: disabled,
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 38,
      height: 22,
      flex: "none",
      padding: 2,
      borderRadius: "var(--radius-pill)",
      border: "none",
      background: checked ? "var(--pool)" : "var(--border-strong)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "background var(--dur-base) var(--ease-standard)",
      display: "inline-flex",
      alignItems: "center",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 18,
      borderRadius: "50%",
      background: "#fff",
      boxShadow: "var(--shadow-sm)",
      transform: checked ? "translateX(16px)" : "translateX(0)",
      transition: "transform var(--dur-base) var(--ease-out)"
    }
  }));
}

/**
 * Checkbox — square, pool-blue when checked.
 */
function Checkbox({
  checked = false,
  onChange,
  disabled = false,
  label = null,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 18,
      height: 18,
      flex: "none",
      borderRadius: "var(--radius-sm)",
      border: checked ? "1px solid var(--pool)" : "1px solid var(--border-strong)",
      background: checked ? "var(--pool)" : "var(--surface)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background var(--dur-fast), border-color var(--dur-fast)"
    }
  }, checked ? /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  })) : null), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-base)",
      color: "var(--ink)"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Switch, Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
/**
 * Stream Line — EmptyState
 * Calm, centered. Icon, short message, optional action.
 */
function EmptyState({
  icon = null,
  title,
  description = null,
  action = null,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: 8,
      padding: "48px 24px",
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius-md)",
      background: "var(--surface-sunk)",
      color: "var(--ink-soft)",
      marginBottom: 4
    }
  }, icon) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-title-3)",
      fontWeight: "var(--weight-semibold)",
      color: "var(--ink)"
    }
  }, title), description ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-base)",
      color: "var(--ink-mid)",
      maxWidth: 320
    }
  }, description) : null, action ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, action) : null);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
/**
 * Stream Line — Toast
 * Floating notification. White surface, faint shadow, status accent bar.
 */
function Toast({
  message,
  variant = "info",
  onClose = null,
  style = {}
}) {
  const accent = {
    info: "var(--pool)",
    success: "var(--success)",
    danger: "var(--danger)",
    warn: "var(--warn)"
  }[variant] || "var(--pool)";
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      minWidth: 240,
      maxWidth: 420,
      padding: "12px 14px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderInlineStart: `3px solid ${accent}`,
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-md)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: "var(--text-base)",
      color: "var(--ink)"
    }
  }, message), onClose ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    "aria-label": "Dismiss",
    style: {
      border: "none",
      background: "transparent",
      color: "var(--ink-soft)",
      cursor: "pointer",
      fontSize: 18,
      lineHeight: 1,
      padding: 0
    }
  }, "\xD7") : null);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Sidebar.jsx
try { (() => {
/**
 * Stream Line — NavItem (sidebar row)
 * Flat Notion-style: quiet by default, warm hover, pool-wash when active.
 */
function NavItem({
  icon = null,
  label,
  active = false,
  badge = null,
  onClick,
  style = {}
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 9,
      width: "100%",
      padding: "6px 10px",
      border: "none",
      borderRadius: "var(--radius)",
      cursor: "pointer",
      textAlign: "start",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-base)",
      fontWeight: active ? "var(--weight-medium)" : "var(--weight-regular)",
      letterSpacing: "var(--tracking-tight)",
      color: active ? "var(--pool)" : "var(--ink-mid)",
      background: active ? "var(--pool-wash)" : h ? "var(--surface-hover)" : "transparent",
      transition: "background var(--dur-fast), color var(--dur-fast)",
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      flex: "none",
      color: active ? "var(--pool)" : "var(--ink-soft)"
    }
  }, icon) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, label), badge != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--text-xs)",
      color: active ? "var(--pool)" : "var(--ink-soft)"
    }
  }, badge) : null);
}

/**
 * Sidebar — flat workspace nav. Header (workspace), scrollable nav body,
 * optional footer.
 */
function Sidebar({
  header = null,
  children,
  footer = null,
  width = "var(--sidebar-w)",
  style = {}
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width,
      flex: "none",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "var(--sidebar)",
      borderInlineEnd: "1px solid var(--border)",
      ...style
    }
  }, header ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 12px 8px"
    }
  }, header) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "4px 8px",
      display: "flex",
      flexDirection: "column",
      gap: 1
    }
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 12px",
      borderTop: "1px solid var(--border)"
    }
  }, footer) : null);
}

/**
 * NavSection — overline group label inside the sidebar.
 */
function NavSection({
  children,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 10px 4px",
      fontSize: "var(--text-micro)",
      fontWeight: "var(--weight-semibold)",
      letterSpacing: "var(--tracking-caps)",
      textTransform: "uppercase",
      color: "var(--ink-soft)",
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { NavItem, Sidebar, NavSection });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Sidebar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopBar.jsx
try { (() => {
/**
 * Stream Line — TopBar
 * Thin workspace header: title / breadcrumb on the start edge,
 * actions on the end edge. Border-bottom, no shadow.
 */
function TopBar({
  title,
  subtitle = null,
  breadcrumb = null,
  actions = null,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      height: 56,
      padding: "0 24px",
      background: "var(--canvas)",
      borderBottom: "1px solid var(--border)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, breadcrumb ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-xs)",
      color: "var(--ink-soft)",
      marginBottom: 1
    }
  }, breadcrumb) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: "var(--text-title-2)",
      fontWeight: "var(--weight-semibold)",
      color: "var(--ink)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, title), subtitle ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-sm)",
      color: "var(--ink-soft)"
    }
  }, subtitle) : null)), actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flex: "none"
    }
  }, actions) : null);
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/workspace/Dashboard.jsx
try { (() => {
// Stream Line — Dashboard (KPIs + simple charts). window.SL_Dashboard
(function () {
  const {
    KpiCard,
    Card,
    Badge
  } = window.StreamLineDesignSystem_132b60;
  const D = window.SL_DATA;
  function Bars() {
    const max = Math.max(...D.weekly);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-end",
        gap: 12,
        height: 150,
        padding: "8px 4px 0"
      }
    }, D.weekly.map((v, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        height: "100%",
        justifyContent: "flex-end"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "num",
      style: {
        fontSize: 11,
        color: "var(--ink-soft)"
      }
    }, v, "%"), /*#__PURE__*/React.createElement("div", {
      style: {
        width: "100%",
        maxWidth: 38,
        height: `${v / max * 100}%`,
        background: i === D.weekly.length - 1 ? "var(--pool)" : "var(--pool-light)",
        borderRadius: "var(--radius-xs) var(--radius-xs) 0 0"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: "var(--ink-soft)"
      }
    }, D.days[i]))));
  }
  function Donut() {
    const total = D.products.reduce((s, p) => s + p.value, 0);
    let acc = 0;
    const segs = D.products.map(p => {
      const start = acc / total * 360;
      acc += p.value;
      const end = acc / total * 360;
      return `${p.color} ${start}deg ${end}deg`;
    }).join(", ");
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 22
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 120,
        height: 120,
        borderRadius: "50%",
        background: `conic-gradient(${segs})`,
        position: "relative",
        flex: "none"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: 26,
        borderRadius: "50%",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "num",
      style: {
        fontSize: 22,
        fontWeight: 600,
        color: "var(--ink)"
      }
    }, total), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: "var(--ink-soft)"
      }
    }, "total"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 9
      }
    }, D.products.map(p => /*#__PURE__*/React.createElement("div", {
      key: p.name,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10,
        height: 10,
        borderRadius: 3,
        background: p.color,
        flex: "none"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--ink-mid)",
        flex: 1
      }
    }, p.name), /*#__PURE__*/React.createElement("span", {
      className: "num",
      style: {
        color: "var(--ink)",
        fontWeight: 500
      }
    }, p.value)))));
  }
  function SL_Dashboard() {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "20px 24px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 980
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 14
      }
    }, /*#__PURE__*/React.createElement(KpiCard, {
      label: "Active enrollments",
      value: "284",
      delta: "+12 this week",
      deltaUp: true
    }), /*#__PURE__*/React.createElement(KpiCard, {
      label: "Lessons this week",
      value: "96",
      delta: "+8",
      deltaUp: true
    }), /*#__PURE__*/React.createElement(KpiCard, {
      label: "Attendance rate",
      value: "92%",
      delta: "+4%",
      deltaUp: true
    }), /*#__PURE__*/React.createElement(KpiCard, {
      label: "Outstanding",
      value: "\u20AA 4,180",
      delta: "-\u20AA620",
      deltaUp: false
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr",
        gap: 16
      }
    }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 15,
        fontWeight: 600,
        color: "var(--ink)"
      }
    }, "Weekly attendance"), /*#__PURE__*/React.createElement(Badge, {
      variant: "success",
      dot: true
    }, "Trending up")), /*#__PURE__*/React.createElement(Bars, null)), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 15,
        fontWeight: 600,
        color: "var(--ink)",
        display: "block",
        marginBottom: 16
      }
    }, "Enrollments by product"), /*#__PURE__*/React.createElement(Donut, null))));
  }
  window.SL_Dashboard = SL_Dashboard;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/workspace/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/workspace/Enrollments.jsx
try { (() => {
// Stream Line — Enrollments (table). window.SL_Enrollments
(function () {
  const {
    Badge,
    Avatar,
    Button,
    Input,
    SegmentedControl
  } = window.StreamLineDesignSystem_132b60;
  const D = window.SL_DATA;
  const payBadge = {
    paid: ["success", "Paid"],
    unpaid: ["warn", "Unpaid"],
    waived: ["neutral", "Waived"]
  };
  function SL_Enrollments() {
    const [filter, setFilter] = React.useState("Active");
    const [q, setQ] = React.useState("");
    const rows = D.enrollments.filter(r => !q || r.child.toLowerCase().includes(q.toLowerCase()) || r.parent.toLowerCase().includes(q.toLowerCase()));
    const th = {
      textAlign: "start",
      padding: "10px 14px",
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "var(--ink-soft)",
      borderBottom: "1px solid var(--border)",
      whiteSpace: "nowrap"
    };
    const td = {
      padding: "11px 14px",
      fontSize: 14,
      color: "var(--ink)",
      borderBottom: "1px solid var(--border)",
      verticalAlign: "middle"
    };
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "20px 24px 28px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement(SegmentedControl, {
      options: ["Active", "All", "Cancelled"],
      value: filter,
      onChange: setFilter,
      size: "sm"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 220
      }
    }, /*#__PURE__*/React.createElement(Input, {
      placeholder: "Search child or parent\u2026",
      value: q,
      onChange: e => setQ(e.target.value)
    })), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "md"
    }, "Add enrollment"))), /*#__PURE__*/React.createElement("div", {
      style: {
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        background: "var(--surface)"
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: "100%",
        borderCollapse: "collapse"
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
      style: th
    }, "Child"), /*#__PURE__*/React.createElement("th", {
      style: th
    }, "Parent"), /*#__PURE__*/React.createElement("th", {
      style: th
    }, "Phone"), /*#__PURE__*/React.createElement("th", {
      style: th
    }, "Product"), /*#__PURE__*/React.createElement("th", {
      style: th
    }, "Instructor"), /*#__PURE__*/React.createElement("th", {
      style: th
    }, "Sessions"), /*#__PURE__*/React.createElement("th", {
      style: th
    }, "Payment"))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => {
      const [variant, label] = payBadge[r.pay];
      const last = i === rows.length - 1;
      const cell = last ? {
        ...td,
        borderBottom: "none"
      } : td;
      return /*#__PURE__*/React.createElement("tr", {
        key: i,
        className: "sl-row"
      }, /*#__PURE__*/React.createElement("td", {
        style: cell
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 9
        }
      }, /*#__PURE__*/React.createElement(Avatar, {
        name: r.child,
        size: 28
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 500
        }
      }, r.child))), /*#__PURE__*/React.createElement("td", {
        style: {
          ...cell,
          color: "var(--ink-mid)"
        }
      }, r.parent), /*#__PURE__*/React.createElement("td", {
        style: cell
      }, /*#__PURE__*/React.createElement("span", {
        className: "num",
        style: {
          fontSize: 13,
          color: "var(--ink-mid)"
        }
      }, r.phone)), /*#__PURE__*/React.createElement("td", {
        style: {
          ...cell,
          color: "var(--ink-mid)"
        }
      }, r.product), /*#__PURE__*/React.createElement("td", {
        style: {
          ...cell,
          color: "var(--ink-mid)"
        }
      }, r.instr), /*#__PURE__*/React.createElement("td", {
        style: cell
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "num",
        style: {
          fontSize: 13,
          color: "var(--ink-mid)"
        }
      }, r.used, "/", r.total), /*#__PURE__*/React.createElement("span", {
        style: {
          width: 54,
          height: 5,
          borderRadius: 999,
          background: "var(--surface-sunk)",
          overflow: "hidden"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          display: "block",
          height: "100%",
          width: `${r.used / r.total * 100}%`,
          background: "var(--pool)"
        }
      })))), /*#__PURE__*/React.createElement("td", {
        style: cell
      }, /*#__PURE__*/React.createElement(Badge, {
        variant: variant,
        dot: r.pay !== "waived"
      }, label)));
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 10,
        fontSize: 12,
        color: "var(--ink-soft)"
      }
    }, rows.length, " active enrollments \xB7 Summer 2026"));
  }
  window.SL_Enrollments = SL_Enrollments;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/workspace/Enrollments.jsx", error: String((e && e.message) || e) }); }

// ui_kits/workspace/Schedule.jsx
try { (() => {
// Stream Line — Schedule (week view). window.SL_Schedule
(function () {
  const {
    SegmentedControl,
    Button,
    Badge
  } = window.StreamLineDesignSystem_132b60;
  const D = window.SL_DATA;
  const START_H = 9,
    END_H = 19,
    ROW = 54;
  const instrById = Object.fromEntries(D.instructors.map(i => [i.id, i]));
  function toMin(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  function LessonBlock({
    l
  }) {
    const ins = instrById[l.instr];
    const top = (toMin(l.start) - START_H * 60) / 60 * ROW;
    const height = l.dur / 60 * ROW - 3;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        insetInline: 3,
        top: top + 1,
        height,
        background: "var(--surface)",
        borderInlineStart: `3px solid ${ins.color}`,
        border: "1px solid var(--border)",
        borderInlineStartWidth: 3,
        borderRadius: "var(--radius-sm)",
        padding: "4px 7px",
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: "var(--shadow-xs)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 600,
        color: "var(--ink)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, l.child), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--ink-soft)",
        display: "flex",
        alignItems: "center",
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "num",
      style: {
        fontSize: 11
      }
    }, l.start), /*#__PURE__*/React.createElement("span", {
      style: {
        color: ins.color
      }
    }, "\xB7 ", ins.name.split(" ")[0])));
  }
  function SL_Schedule() {
    const [view, setView] = React.useState("Week");
    const hours = [];
    for (let h = START_H; h <= END_H; h++) hours.push(h);
    const todayIdx = 3; // Wed highlighted

    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "20px 24px 28px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 15,
        fontWeight: 600,
        color: "var(--ink)"
      }
    }, "15\u201321 June 2026"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 4
      }
    }, D.instructors.map(i => /*#__PURE__*/React.createElement("span", {
      key: i.id,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        color: "var(--ink-mid)",
        padding: "2px 8px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-pill)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: i.color
      }
    }), i.name.split(" ")[0])))), /*#__PURE__*/React.createElement(SegmentedControl, {
      options: ["Day", "Week", "Month"],
      value: view,
      onChange: setView,
      size: "sm"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        background: "var(--surface)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "56px repeat(7, 1fr)",
        borderBottom: "1px solid var(--border)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        borderInlineEnd: "1px solid var(--border)"
      }
    }), D.days.map((d, i) => /*#__PURE__*/React.createElement("div", {
      key: d,
      style: {
        padding: "8px 0",
        textAlign: "center",
        borderInlineEnd: i < 6 ? "1px solid var(--border)" : "none",
        background: i === todayIdx ? "var(--pool-wash)" : "transparent"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: i === todayIdx ? "var(--pool)" : "var(--ink-soft)",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em"
      }
    }, d), /*#__PURE__*/React.createElement("div", {
      className: "num",
      style: {
        fontSize: 15,
        color: i === todayIdx ? "var(--pool)" : "var(--ink)",
        fontWeight: 600,
        marginTop: 1
      }
    }, 15 + i)))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "56px repeat(7, 1fr)",
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        borderInlineEnd: "1px solid var(--border)"
      }
    }, hours.map(h => /*#__PURE__*/React.createElement("div", {
      key: h,
      style: {
        height: ROW,
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "num",
      style: {
        position: "absolute",
        top: -7,
        right: 8,
        fontSize: 10,
        color: "var(--ink-faint)"
      }
    }, String(h).padStart(2, "0"), ":00")))), D.days.map((d, di) => /*#__PURE__*/React.createElement("div", {
      key: d,
      style: {
        position: "relative",
        borderInlineEnd: di < 6 ? "1px solid var(--border)" : "none",
        background: di === todayIdx ? "rgba(0,119,182,0.022)" : "transparent"
      }
    }, hours.map((h, hi) => /*#__PURE__*/React.createElement("div", {
      key: h,
      style: {
        height: ROW,
        borderBottom: hi < hours.length - 1 ? "1px solid var(--border)" : "none"
      }
    })), D.lessons.filter(l => l.day === di).map((l, idx) => /*#__PURE__*/React.createElement(LessonBlock, {
      key: idx,
      l: l
    })))))));
  }
  window.SL_Schedule = SL_Schedule;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/workspace/Schedule.jsx", error: String((e && e.message) || e) }); }

// ui_kits/workspace/data.js
try { (() => {
// Stream Line — UI kit mock data (window globals, no exports)
window.SL_DATA = function () {
  const instructors = [{
    id: "i1",
    name: "Maya Levi",
    color: "var(--instr-1)"
  }, {
    id: "i2",
    name: "Dana Bar",
    color: "var(--instr-2)"
  }, {
    id: "i3",
    name: "Omer Katz",
    color: "var(--instr-3)"
  }, {
    id: "i4",
    name: "Noa Shaul",
    color: "var(--instr-4)"
  }];

  // week grid: hours 14–19, lessons keyed by day index (0=Sun)
  const lessons = [{
    day: 0,
    start: "15:00",
    dur: 30,
    child: "Yoav Cohen",
    instr: "i1"
  }, {
    day: 0,
    start: "16:30",
    dur: 30,
    child: "Lia Mor",
    instr: "i2"
  }, {
    day: 1,
    start: "14:30",
    dur: 30,
    child: "Adam Peretz",
    instr: "i3"
  }, {
    day: 1,
    start: "16:00",
    dur: 60,
    child: "Group · Dolphins",
    instr: "i1",
    group: true
  }, {
    day: 1,
    start: "17:30",
    dur: 30,
    child: "Tamar Gal",
    instr: "i4"
  }, {
    day: 2,
    start: "15:30",
    dur: 30,
    child: "Eitan Bar",
    instr: "i2"
  }, {
    day: 2,
    start: "17:00",
    dur: 30,
    child: "Shira Dov",
    instr: "i3"
  }, {
    day: 3,
    start: "14:00",
    dur: 60,
    child: "Group · Turtles",
    instr: "i4",
    group: true
  }, {
    day: 3,
    start: "16:30",
    dur: 30,
    child: "Roni Avraham",
    instr: "i1"
  }, {
    day: 4,
    start: "15:00",
    dur: 30,
    child: "Maya Stern",
    instr: "i2"
  }, {
    day: 4,
    start: "16:00",
    dur: 30,
    child: "Gil Shemesh",
    instr: "i3"
  }, {
    day: 4,
    start: "17:30",
    dur: 30,
    child: "Noam Levi",
    instr: "i1"
  }, {
    day: 5,
    start: "09:30",
    dur: 60,
    child: "Group · Sharks",
    instr: "i2",
    group: true
  }, {
    day: 5,
    start: "11:00",
    dur: 30,
    child: "Daniel Tov",
    instr: "i4"
  }];
  const enrollments = [{
    child: "Yoav Cohen",
    parent: "Tal Cohen",
    phone: "054-812-3390",
    product: "Private · Mon 16:30",
    instr: "Maya Levi",
    pay: "paid",
    used: 6,
    total: 8
  }, {
    child: "Lia Mor",
    parent: "Roni Mor",
    phone: "052-447-1185",
    product: "Private · Sun 16:30",
    instr: "Dana Bar",
    pay: "unpaid",
    used: 2,
    total: 8
  }, {
    child: "Adam Peretz",
    parent: "Sivan Peretz",
    phone: "050-339-7741",
    product: "Group · Dolphins",
    instr: "Omer Katz",
    pay: "paid",
    used: 5,
    total: 12
  }, {
    child: "Tamar Gal",
    parent: "Yael Gal",
    phone: "053-998-2204",
    product: "Private · Mon 17:30",
    instr: "Noa Shaul",
    pay: "waived",
    used: 8,
    total: 8
  }, {
    child: "Eitan Bar",
    parent: "Dana Bar",
    phone: "054-110-6628",
    product: "Private · Tue 15:30",
    instr: "Dana Bar",
    pay: "paid",
    used: 3,
    total: 8
  }, {
    child: "Shira Dov",
    parent: "Liat Dov",
    phone: "052-771-0093",
    product: "Group · Turtles",
    instr: "Omer Katz",
    pay: "unpaid",
    used: 1,
    total: 12
  }, {
    child: "Roni Avraham",
    parent: "Ido Avraham",
    phone: "050-664-8810",
    product: "Private · Wed 16:30",
    instr: "Maya Levi",
    pay: "paid",
    used: 7,
    total: 8
  }, {
    child: "Maya Stern",
    parent: "Gad Stern",
    phone: "053-221-5567",
    product: "Private · Thu 15:00",
    instr: "Dana Bar",
    pay: "paid",
    used: 4,
    total: 8
  }];
  const weekly = [62, 71, 68, 80, 74, 88, 92]; // attendance %
  const products = [{
    name: "Private lessons",
    value: 168,
    color: "var(--instr-1)"
  }, {
    name: "Group · Dolphins",
    value: 44,
    color: "var(--instr-2)"
  }, {
    name: "Group · Turtles",
    value: 38,
    color: "var(--instr-3)"
  }, {
    name: "Summer course",
    value: 34,
    color: "var(--instr-4)"
  }];
  return {
    instructors,
    lessons,
    enrollments,
    weekly,
    products,
    hours: ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"],
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  };
}();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/workspace/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.KpiCard = __ds_scope.KpiCard;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Spinner = __ds_scope.Spinner;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.NavSection = __ds_scope.NavSection;

__ds_ns.TopBar = __ds_scope.TopBar;

})();
