export default function InstructorLegend({ instructors }) {
  if (!instructors.length) return null;
  return (
    <div className="schedule-legend">
      {instructors.map(inst => (
        <span key={inst.id} className="schedule-legend-chip">
          <span className="schedule-legend-dot" style={{ background: inst.color.bg }} />
          {inst.name}
        </span>
      ))}
    </div>
  );
}
