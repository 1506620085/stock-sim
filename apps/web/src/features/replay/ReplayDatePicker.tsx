import { useMemo } from "react";
import { AppDatePicker } from "../../components/AppDatePicker";

type Props = {
  value: string;
  availableDates: string[];
  disabled?: boolean;
  onChange: (date: string) => void;
};

export function ReplayDatePicker({ value, availableDates, disabled = false, onChange }: Props) {
  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);
  const bounds = useMemo(() => getDateBounds(availableDates), [availableDates]);

  return (
    <div className="replay-day-picker">
      <span className="replay-day-picker-label">当前复盘日</span>
      <AppDatePicker
        availableDates={availableDates}
        className="replay-day-picker-input"
        disabled={disabled}
        onChange={onChange}
        placeholder="选择复盘日"
        placement="bottomRight"
        popupClassName="replay-day-picker-popup"
        primaryColor="#f44336"
        value={value}
        renderExtraFooter={() =>
          bounds ? (
            <div className="replay-day-picker-footer">
              <button
                className="replay-day-picker-quick"
                disabled={!availableSet.has(bounds.minDate)}
                onClick={() => onChange(bounds.minDate)}
                type="button"
              >
                最早
              </button>
              <button
                className="replay-day-picker-quick"
                disabled={!availableSet.has(bounds.maxDate)}
                onClick={() => onChange(bounds.maxDate)}
                type="button"
              >
                最新
              </button>
            </div>
          ) : null
        }
      />
    </div>
  );
}

function getDateBounds(dates: string[]) {
  if (!dates.length) return null;
  const sorted = [...dates].sort();
  return {
    minDate: sorted[0],
    maxDate: sorted[sorted.length - 1],
  };
}
