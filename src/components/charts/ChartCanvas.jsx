import { ResponsiveContainer } from "recharts";

export default function ChartCanvas({ height = 240, children }) {
  return (
    <div className="chart-canvas" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
