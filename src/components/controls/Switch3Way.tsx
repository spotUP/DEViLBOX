/**
 * Switch3Way - 3-position switch control styled like hardware toggles
 */

interface Switch3WayProps<T extends string> {
  label: string;
  value: T;
  options: [T, T, T]; // [left, center, right]
  labels?: [string, string, string]; // Display labels for each position
  onChange: (value: T) => void;
  color?: string;
}

export function Switch3Way<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  color = '#00d4aa',
}: Switch3WayProps<T>) {
  const currentIndex = options.indexOf(value);
  const position = currentIndex === -1 ? 1 : currentIndex; // Default to center

  return (
    <div className="switch3way-container">
      <div className="switch3way-label">{label}</div>
      <div className="switch3way-track">
        {/* Option labels */}
        <div className="switch3way-options">
          {options.map((opt, idx) => (
            <button
              key={opt}
              className={`switch3way-option ${position === idx ? 'switch3way-option-active' : ''}`}
              onClick={() => onChange(opt)}
              style={{
                color: position === idx ? color : '#666',
                textShadow: position === idx ? `0 0 4px ${color}80` : 'none',
              }}
            >
              {labels ? labels[idx] : opt}
            </button>
          ))}
        </div>
        {/* Slider indicator */}
        <div
          className="switch3way-indicator"
          style={{
            left: `${(position / 2) * 100}%`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      </div>
    </div>
  );
}
