import { useMemo } from "react";
import { ConfigProvider, DatePicker } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");

type Props = {
  value: string;
  availableDates: string[];
  disabled?: boolean;
  onChange: (date: string) => void;
};

export function ReplayDatePicker({ value, availableDates, disabled = false, onChange }: Props) {
  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);
  const bounds = useMemo(() => getDateBounds(availableDates), [availableDates]);
  const pickerValue = value ? dayjs(value) : null;

  function handleChange(date: Dayjs | null) {
    if (!date) return;
    const next = date.format("YYYY-MM-DD");
    if (availableSet.has(next)) {
      onChange(next);
    }
  }

  function disabledDate(current: Dayjs) {
    if (!current) return true;
    return !availableSet.has(current.format("YYYY-MM-DD"));
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#f44336",
          borderRadius: 8,
          controlHeight: 34,
          fontSize: 14,
        },
        components: {
          DatePicker: {
            cellHeight: 32,
            cellWidth: 32,
            paddingBlock: 4,
            paddingInline: 12,
          },
        },
      }}
    >
      <div className="replay-day-picker">
        <span className="replay-day-picker-label">当前复盘日</span>
        <DatePicker
          allowClear={false}
          className="replay-day-picker-input"
          disabled={disabled || !availableDates.length}
          disabledDate={disabledDate}
          format="YYYY-MM-DD"
          getPopupContainer={() => document.body}
          inputReadOnly={false}
          maxDate={bounds ? dayjs(bounds.maxDate) : undefined}
          minDate={bounds ? dayjs(bounds.minDate) : undefined}
          onChange={handleChange}
          placeholder="选择复盘日"
          placement="bottomRight"
          popupClassName="replay-day-picker-popup"
          showNow={false}
          showToday={false}
          value={pickerValue}
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
    </ConfigProvider>
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
