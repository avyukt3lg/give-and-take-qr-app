export function PriceSparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  const data = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const minimum = Math.min(...data);
  const maximum = Math.max(...data);
  const range = Math.max(1, maximum - minimum);
  const points = data
    .map((value, index) => {
      const x = (index / Math.max(1, data.length - 1)) * 100;
      const y = 38 - ((value - minimum) / range) * 34;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      className="price-sparkline"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}. Values ${data.join(", ")}.`}
    >
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
