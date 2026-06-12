import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export default function AnimatedToast({ msg, visible, standalone = false }) {
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {visible && msg && (
        <motion.div
          className={`toast${standalone ? " toast--standalone" : ""}`}
          style={{ left: "50%" }}
          initial={{ opacity: 0, y: reduced ? 0 : 24, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: reduced ? 0 : 12, x: "-50%" }}
          transition={reduced ? { duration: 0.01 } : { type: "spring", stiffness: 400, damping: 30, bounce: 0.15 }}
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
