/**
 * AppDatePicker
 * 通用日期选择组件：基于 Ant Design DatePicker，支持可选日期白名单、起止范围与底部扩展区。
 */
import { useMemo, type ReactNode } from "react";
import { ConfigProvider, DatePicker } from "antd";
import type { DatePickerProps } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");

type DisabledDateInfo = {
  type: "date" | "week" | "month" | "quarter" | "year" | "decade" | "time";
};

export type AppDatePickerProps = {
  value: string;
  onChange: (date: string) => void;
  /** When provided, only these YYYY-MM-DD dates are selectable. */
  availableDates?: string[];
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  allowClear?: boolean;
  placeholder?: string;
  className?: string;
  popupClassName?: string;
  format?: string;
  placement?: DatePickerProps["placement"];
  renderExtraFooter?: () => ReactNode;
  /** Calendar primary color; defaults to form accent. */
  primaryColor?: string;
};

export function AppDatePicker({
  value,
  onChange,
  availableDates,
  minDate,
  maxDate,
  disabled = false,
  allowClear = false,
  placeholder = "选择日期",
  className,
  popupClassName,
  format = "YYYY-MM-DD",
  placement = "bottomLeft",
  renderExtraFooter,
  primaryColor = "#176c8f",
}: AppDatePickerProps) {
  const availableSet = useMemo(
    () => (availableDates?.length ? new Set(availableDates) : null),
    [availableDates],
  );
  const availableMonths = useMemo(
    () => (availableDates?.length ? new Set(availableDates.map((date) => date.slice(0, 7))) : null),
    [availableDates],
  );
  const availableYears = useMemo(
    () => (availableDates?.length ? new Set(availableDates.map((date) => Number(date.slice(0, 4)))) : null),
    [availableDates],
  );
  const bounds = useMemo(() => {
    if (availableDates?.length) return getDateBounds(availableDates);
    return {
      minDate: minDate,
      maxDate: maxDate,
    };
  }, [availableDates, maxDate, minDate]);

  const pickerValue = value ? dayjs(value) : null;

  function handleChange(date: Dayjs | null) {
    if (!date) {
      if (allowClear) onChange("");
      return;
    }
    const next = date.format("YYYY-MM-DD");
    if (availableSet && !availableSet.has(next)) return;
    onChange(next);
  }

  function disabledDate(current: Dayjs, info: DisabledDateInfo) {
    if (!current) return true;

    if (availableSet && availableMonths && availableYears) {
      if (info.type === "year") {
        return !availableYears.has(current.year());
      }

      if (info.type === "month" || info.type === "quarter") {
        return !availableMonths.has(current.format("YYYY-MM"));
      }

      if (info.type === "decade") {
        const decadeStart = Math.floor(current.year() / 10) * 10;
        for (let year = decadeStart; year < decadeStart + 10; year += 1) {
          if (availableYears.has(year)) return false;
        }
        return true;
      }

      return !availableSet.has(current.format("YYYY-MM-DD"));
    }

    if (bounds.minDate && current.isBefore(dayjs(bounds.minDate), "day")) return true;
    if (bounds.maxDate && current.isAfter(dayjs(bounds.maxDate), "day")) return true;
    return false;
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: primaryColor,
          borderRadius: 6,
          controlHeight: 40,
          fontSize: 14,
          colorBorder: "var(--line)",
        },
        components: {
          DatePicker: {
            cellWidth: 36,
            cellHeight: 36,
            textHeight: 36,
            activeBorderColor: primaryColor,
            hoverBorderColor: primaryColor,
          },
        },
      }}
    >
      <DatePicker
        allowClear={allowClear}
        className={["app-date-picker", className].filter(Boolean).join(" ")}
        disabled={disabled || (Boolean(availableDates) && !availableDates?.length)}
        disabledDate={disabledDate}
        format={format}
        getPopupContainer={() => document.body}
        inputReadOnly={false}
        maxDate={bounds.maxDate ? dayjs(bounds.maxDate) : undefined}
        minDate={bounds.minDate ? dayjs(bounds.minDate) : undefined}
        onChange={handleChange}
        placeholder={placeholder}
        placement={placement}
        popupClassName={["app-date-picker-popup", popupClassName].filter(Boolean).join(" ")}
        renderExtraFooter={renderExtraFooter}
        showNow={false}
        showToday={false}
        value={pickerValue}
      />
    </ConfigProvider>
  );
}

function getDateBounds(dates: string[]) {
  const sorted = [...dates].sort();
  return {
    minDate: sorted[0],
    maxDate: sorted[sorted.length - 1],
  };
}
