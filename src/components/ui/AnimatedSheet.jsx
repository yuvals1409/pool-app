import { motion, useReducedMotion } from "framer-motion";

const spring = { type: "spring", stiffness: 400, damping: 30, bounce: 0.15 };

export function AnimatedSheetOverlay({ onClose, children }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="schedule-panel-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduced ? { duration: 0.01 } : { duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedSheetPanel({ children, onClick }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="schedule-panel"
      onClick={onClick}
      initial={{ y: reduced ? 0 : "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={reduced ? { duration: 0.01 } : spring}
    >
      {children}
    </motion.div>
  );
}
