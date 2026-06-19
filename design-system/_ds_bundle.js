/* @ds-bundle: {"format":3,"namespace":"StreamLineDesignSystem_627cd6","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"KpiCard","sourcePath":"components/core/Card.jsx"},{"name":"Field","sourcePath":"components/core/Input.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Select","sourcePath":"components/core/Input.jsx"},{"name":"Spinner","sourcePath":"components/core/Spinner.jsx"},{"name":"Toast","sourcePath":"components/core/Toast.jsx"},{"name":"Sidebar","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"TabBar","sourcePath":"components/navigation/TabBar.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"7350a2320961","components/core/Badge.jsx":"df7451dcd8ca","components/core/Button.jsx":"440a9996a7ba","components/core/Card.jsx":"6bc2ca068e3b","components/core/Input.jsx":"ccd665aec158","components/core/Spinner.jsx":"338830e238ab","components/core/Toast.jsx":"9d3d465f343b","components/navigation/Sidebar.jsx":"ac5b932eb2e3","components/navigation/TabBar.jsx":"c81aed41369f"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.StreamLineDesignSystem_627cd6 = window.StreamLineDesignSystem_627cd6 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
/**
 * @component Avatar
 * @description User avatar with image or auto-generated initials fallback.
 */
function Avatar({
  name,
  src,
  size = 32,
  style: extra
}) {
  const initials = name ? name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size < 36 ? 'var(--text-footnote)' : 'var(--text-body)',
    fontWeight: 700,
    background: 'var(--pool-pale)',
    color: 'var(--accent)',
    border: '1.5px solid var(--separator)',
    ...extra
  };
  if (src) {
    return /*#__PURE__*/React.createElement("div", {
      style: base
    }, /*#__PURE__*/React.createElement("img", {
      src: src,
      alt: name || '',
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover'
      }
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: base
  }, initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
/**
 * @component Badge
 * @description Status pill for lessons, enrollments, roles and user states.
 *   All colours are CSS custom properties so badges adapt to light/dark mode.
 */
function Badge({
  children,
  variant = 'active',
  style: extra
}) {
  const variantMap = {
    active: {
      background: 'var(--success-bg)',
      color: 'var(--success)'
    },
    pending: {
      background: 'var(--warn-bg)',
      color: 'var(--badge-pending-fg)'
    },
    cancelled: {
      background: 'var(--danger-bg)',
      color: 'var(--danger)'
    },
    used: {
      background: 'var(--danger-bg)',
      color: 'var(--danger)'
    },
    danger: {
      background: 'var(--danger-bg)',
      color: 'var(--danger)'
    },
    info: {
      background: 'var(--info-bg)',
      color: 'var(--info)'
    },
    admin: {
      background: 'var(--badge-admin-bg)',
      color: 'var(--badge-admin-fg)'
    },
    owner: {
      background: 'var(--badge-owner-bg)',
      color: 'var(--badge-owner-fg)'
    },
    instructor: {
      background: 'var(--badge-instructor-bg)',
      color: 'var(--badge-instructor-fg)'
    },
    guard: {
      background: 'var(--badge-guard-bg)',
      color: 'var(--badge-guard-fg)'
    },
    office: {
      background: 'var(--badge-office-bg)',
      color: 'var(--badge-office-fg)'
    },
    parent: {
      background: 'var(--badge-parent-bg)',
      color: 'var(--badge-parent-fg)'
    },
    neutral: {
      background: 'var(--bg-secondary)',
      color: 'var(--label-secondary)'
    }
  };
  const v = variantMap[variant] || variantMap.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 'var(--radius-pill)',
      fontSize: 'var(--text-caption)',
      fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
      ...v,
      ...extra
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * @component Button
 * @description Primary interactive control. Covers all Stream Line action types.
 */

function _spinnerEl(color) {
  return React.createElement('span', {
    style: {
      display: 'inline-block',
      width: 16,
      height: 16,
      border: `2.5px solid ${color === 'dark' ? 'rgba(1,42,74,.25)' : 'rgba(255,255,255,.3)'}`,
      borderTopColor: color === 'dark' ? 'var(--ink)' : '#fff',
      borderRadius: '50%',
      animation: 'sl-spin .7s linear infinite',
      flexShrink: 0
    }
  });
}
function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  disabled = false,
  loading = false,
  icon = null,
  onClick,
  type = 'button',
  style: extraStyle,
  ...props
}) {
  const sizeMap = {
    sm: {
      padding: '8px 16px',
      fontSize: 'var(--text-subhead)',
      minHeight: 'var(--tap-target-min)'
    },
    md: {
      padding: '12px 16px',
      fontSize: 'var(--text-body)',
      minHeight: 'var(--tap-target-min)'
    },
    lg: {
      padding: '14px 20px',
      fontSize: 'var(--text-headline)',
      minHeight: '52px'
    },
    scan: {
      padding: '14px 16px',
      fontSize: 'var(--text-headline)',
      minHeight: '52px'
    }
  };
  const variantMap = {
    primary: {
      background: 'linear-gradient(135deg, var(--pool) 0%, var(--pool-deep) 100%)',
      color: '#fff',
      border: 'none',
      boxShadow: 'var(--shadow-btn)'
    },
    secondary: {
      background: 'var(--bg)',
      color: 'var(--ink)',
      border: '1.5px solid var(--separator)',
      boxShadow: '0 2px 8px rgba(0,0,0,.06)'
    },
    outline: {
      background: 'var(--bg)',
      color: 'var(--accent)',
      border: '1.5px solid var(--accent)',
      boxShadow: 'none'
    },
    danger: {
      background: 'var(--danger)',
      color: '#fff',
      border: 'none',
      boxShadow: 'none'
    },
    success: {
      background: 'var(--success)',
      color: '#fff',
      border: 'none',
      boxShadow: 'none'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--accent)',
      border: 'none',
      boxShadow: 'none'
    },
    whatsapp: {
      background: '#25D366',
      color: '#fff',
      border: 'none',
      boxShadow: 'none'
    },
    google: {
      background: 'var(--bg)',
      color: '#3c4043',
      border: '1.5px solid var(--separator)',
      boxShadow: '0 2px 8px rgba(0,0,0,.08)'
    }
  };
  const spinnerColor = ['primary', 'danger', 'success', 'whatsapp'].includes(variant) ? 'light' : 'dark';
  const isDisabled = disabled || loading;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    onClick: !isDisabled ? onClick : undefined,
    disabled: isDisabled,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-2)',
      borderRadius: 'var(--radius)',
      fontFamily: 'inherit',
      fontWeight: 600,
      letterSpacing: 'var(--tracking-body)',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? 0.45 : 1,
      transition: 'all var(--dur-fast)',
      width: fullWidth ? '100%' : 'auto',
      WebkitTapHighlightColor: 'transparent',
      userSelect: 'none',
      textDecoration: 'none',
      ...(sizeMap[size] || sizeMap.md),
      ...(variantMap[variant] || variantMap.primary),
      ...extraStyle
    }
  }, props), loading && _spinnerEl(spinnerColor), !loading && icon, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * @component Card
 * @description Surface container. Default flat (border only); elevated with layered pool-blue shadow.
 */
function Card({
  children,
  elevated = false,
  padding = 'md',
  radius = 'card',
  style: extra,
  ...props
}) {
  const padMap = {
    none: '0',
    sm: 'var(--space-3)',
    md: 'var(--space-4)',
    lg: 'var(--space-5)'
  };
  const radMap = {
    sm: 'var(--radius-sm)',
    md: 'var(--radius)',
    card: 'var(--radius-card)',
    xl: 'var(--radius-xl)'
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--bg)',
      border: '1px solid var(--separator)',
      borderRadius: radMap[radius] || radMap.card,
      padding: padMap[padding] || padMap.md,
      boxShadow: elevated ? 'var(--shadow)' : 'none',
      overflow: 'hidden',
      minWidth: 0,
      ...extra
    }
  }, props), children);
}

/**
 * @component KpiCard
 * @description Dashboard KPI metric tile — label + large value.
 */
function KpiCard({
  label,
  value,
  accent = false,
  style: extra
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-secondary)',
      border: '1px solid var(--separator)',
      borderRadius: 'var(--radius-card)',
      padding: 'var(--space-4)',
      textAlign: 'center',
      ...extra
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-caption)',
      color: 'var(--label-secondary)',
      marginBottom: 'var(--space-1)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '1.75rem',
      fontWeight: 700,
      color: accent ? 'var(--accent)' : 'var(--label)',
      fontFamily: 'var(--font-mono)',
      lineHeight: 1.1
    }
  }, value));
}
Object.assign(__ds_scope, { Card, KpiCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * @component Input
 * @description Form input primitives: text field, select, textarea, with label wrapper.
 */
function Field({
  label,
  hint,
  children,
  style: extra
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 'var(--space-4)',
      minWidth: 0,
      ...extra
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 'var(--text-footnote)',
      fontWeight: 600,
      color: 'var(--label-secondary)',
      marginBottom: 'var(--space-2)'
    }
  }, label), children, hint && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 'var(--text-caption)',
      color: 'var(--label-tertiary)',
      marginTop: 'var(--space-1)',
      lineHeight: 'var(--leading-normal)'
    }
  }, hint));
}
function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  error = false,
  style: extra,
  ...props
}) {
  return /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    style: {
      width: '100%',
      padding: 'var(--space-3) var(--space-4)',
      border: `1.5px solid ${error ? 'var(--danger)' : 'var(--separator)'}`,
      borderRadius: 'var(--radius)',
      fontFamily: 'inherit',
      fontSize: 'var(--text-body)',
      color: 'var(--label)',
      background: disabled ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
      outline: 'none',
      minHeight: 'var(--tap-target-min)',
      letterSpacing: 'var(--tracking-body)',
      maxWidth: '100%',
      minWidth: 0,
      opacity: disabled ? 0.55 : 1,
      transition: 'border-color var(--dur-fast)',
      ...extra
    }
  }, props));
}
function Select({
  value,
  onChange,
  children,
  disabled = false,
  style: extra,
  ...props
}) {
  return /*#__PURE__*/React.createElement("select", _extends({
    value: value,
    onChange: onChange,
    disabled: disabled,
    style: {
      width: '100%',
      padding: 'var(--space-3) var(--space-4)',
      border: '1.5px solid var(--separator)',
      borderRadius: 'var(--radius)',
      fontFamily: 'inherit',
      fontSize: 'var(--text-body)',
      color: 'var(--label)',
      background: 'var(--bg-secondary)',
      outline: 'none',
      minHeight: 'var(--tap-target-min)',
      cursor: 'pointer',
      appearance: 'none',
      opacity: disabled ? 0.55 : 1,
      ...extra
    }
  }, props), children);
}
Object.assign(__ds_scope, { Field, Input, Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Spinner.jsx
try { (() => {
/**
 * @component Spinner
 * @description Circular loading indicator. Light or dark.
 */
function Spinner({
  size = 20,
  color = 'accent',
  style: extra
}) {
  const colorMap = {
    accent: {
      border: 'rgba(0,119,182,.25)',
      top: 'var(--pool)'
    },
    white: {
      border: 'rgba(255,255,255,.3)',
      top: '#fff'
    },
    dark: {
      border: 'rgba(1,42,74,.2)',
      top: 'var(--ink)'
    },
    muted: {
      border: 'var(--separator)',
      top: 'var(--label-secondary)'
    }
  };
  const c = colorMap[color] || colorMap.accent;
  return /*#__PURE__*/React.createElement("span", {
    role: "progressbar",
    style: {
      display: 'inline-block',
      width: size,
      height: size,
      border: `${Math.max(2, size * 0.13)}px solid ${c.border}`,
      borderTopColor: c.top,
      borderRadius: '50%',
      animation: 'sl-spin .7s linear infinite',
      flexShrink: 0,
      ...extra
    }
  });
}
Object.assign(__ds_scope, { Spinner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Spinner.jsx", error: String((e && e.message) || e) }); }

// components/core/Toast.jsx
try { (() => {
/**
 * @component Toast
 * @description Fixed-position toast notification. Appears above the tab bar.
 */
function Toast({
  message,
  visible = true,
  standalone = false,
  style: extra
}) {
  if (!message) return null;
  const bottomOffset = standalone ? 'calc(var(--space-5) + env(safe-area-inset-bottom, 0px))' : 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px) + var(--space-2))';
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    "aria-live": "polite",
    style: {
      position: 'fixed',
      bottom: bottomOffset,
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? '0' : '16px'})`,
      background: 'var(--ink)',
      color: '#fff',
      padding: 'var(--space-3) var(--space-5)',
      borderRadius: 'var(--radius-pill)',
      fontSize: 'var(--text-subhead)',
      fontWeight: 500,
      boxShadow: 'var(--shadow-lg)',
      zIndex: 'var(--z-toast)',
      whiteSpace: 'nowrap',
      maxWidth: 'calc(100% - var(--space-8))',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      opacity: visible ? 1 : 0,
      transition: 'opacity var(--dur-normal), transform var(--dur-normal)',
      pointerEvents: visible ? 'auto' : 'none',
      ...extra
    }
  }, message);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Toast.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Sidebar.jsx
try { (() => {
/**
 * @component Sidebar
 * @description Desktop sidebar navigation. Shows logo, nav items, user info. RTL layout.
 */
function Sidebar({
  logoSrc,
  brandName = 'Stream Line',
  items = [],
  activeId,
  onItemChange,
  user,
  style: extra
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 'var(--sidebar-w)',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-secondary)',
      borderInlineStart: '1px solid var(--separator)',
      overflowY: 'auto',
      padding: 'var(--space-4) var(--space-2)',
      gap: 'var(--space-2)',
      ...extra
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: 'var(--space-2) var(--space-3) var(--space-4)',
      fontSize: 'var(--text-headline)',
      fontWeight: 700,
      color: 'var(--ink)',
      borderBottom: '1px solid var(--separator)',
      marginBottom: 'var(--space-2)'
    }
  }, logoSrc && /*#__PURE__*/React.createElement("img", {
    src: logoSrc,
    alt: brandName,
    style: {
      height: 28,
      width: 'auto'
    }
  }), brandName), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)',
      flex: 1
    }
  }, items.map(item => {
    const isActive = item.id === activeId;
    return /*#__PURE__*/React.createElement("button", {
      key: item.id,
      onClick: () => onItemChange?.(item.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        width: '100%',
        padding: 'var(--space-3)',
        border: 'none',
        borderRadius: 'var(--radius)',
        background: isActive ? 'var(--pool-pale)' : 'transparent',
        fontFamily: 'inherit',
        fontSize: 'var(--text-subhead)',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? 'var(--accent)' : 'var(--nav-inactive)',
        cursor: 'pointer',
        textAlign: 'start',
        transition: 'background var(--dur-fast), color var(--dur-fast)',
        minHeight: 'var(--tap-target-min)'
      }
    }, item.icon && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }
    }, item.icon), item.label);
  })), user && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: 'var(--space-3)',
      borderTop: '1px solid var(--separator)',
      marginTop: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: 'var(--pool-pale)',
      color: 'var(--accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 'var(--text-footnote)',
      fontWeight: 700,
      flexShrink: 0
    }
  }, user.name ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-footnote)',
      fontWeight: 600,
      color: 'var(--label)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, user.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-caption)',
      color: 'var(--label-secondary)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-mono)'
    }
  }, user.email))));
}
Object.assign(__ds_scope, { Sidebar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Sidebar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TabBar.jsx
try { (() => {
/**
 * @component TabBar
 * @description iOS-style bottom navigation bar with frosted glass. 44px tap targets. RTL-aware.
 */
function TabBar({
  tabs = [],
  activeId,
  onTabChange,
  style: extra
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      position: 'fixed',
      bottom: 0,
      insetInline: 0,
      maxWidth: 'var(--app-max-w)',
      margin: '0 auto',
      zIndex: 'var(--z-overlay)',
      background: 'var(--nav-bg)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderTop: '1px solid var(--nav-border)',
      padding: 'var(--space-1) var(--space-2)',
      paddingBottom: 'calc(var(--space-1) + env(safe-area-inset-bottom, 0px))',
      gap: 'var(--space-1)',
      ...extra
    }
  }, tabs.map(tab => {
    const isActive = tab.id === activeId;
    return /*#__PURE__*/React.createElement("button", {
      key: tab.id,
      onClick: () => onTabChange?.(tab.id),
      style: {
        flex: 1,
        padding: '6px var(--space-1) var(--space-2)',
        background: 'none',
        border: 'none',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        lineHeight: 1.2,
        color: isActive ? 'var(--accent)' : 'var(--nav-inactive)',
        transition: 'color var(--dur-normal)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        minHeight: 'var(--tap-target-min)',
        WebkitTapHighlightColor: 'transparent'
      }
    }, tab.icon && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, tab.icon), /*#__PURE__*/React.createElement("span", null, tab.label));
  }));
}
Object.assign(__ds_scope, { TabBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TabBar.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.KpiCard = __ds_scope.KpiCard;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Spinner = __ds_scope.Spinner;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.TabBar = __ds_scope.TabBar;

})();
