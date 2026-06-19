export default function InstructorLegend({ instructors }) {
  if (!instructors.length) return null;
  return (
    <div className="schedule-legend">
      {instructors.map(inst => (
        <span key={inst.id} className="schedule-legend-chip">
          <span className={`schedule-legend-dot ${inst.className}`} />
          {inst.name}
        </span>
      ))}
    </div>
  );
}
