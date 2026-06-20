import { createContext, useCallback, useContext, useMemo, useState } from "react";

const StudentProfileContext = createContext(null);

export function StudentProfileProvider({ children }) {
  const [participantId, setParticipantId] = useState(null);

  const openProfile = useCallback((id) => {
    if (id) setParticipantId(id);
  }, []);

  const closeProfile = useCallback(() => setParticipantId(null), []);

  const value = useMemo(
    () => ({ participantId, openProfile, closeProfile }),
    [participantId, openProfile, closeProfile],
  );

  return (
    <StudentProfileContext.Provider value={value}>
      {children}
    </StudentProfileContext.Provider>
  );
}

export function useStudentProfile() {
  const ctx = useContext(StudentProfileContext);
  if (!ctx) throw new Error("useStudentProfile requires StudentProfileProvider");
  return ctx;
}
