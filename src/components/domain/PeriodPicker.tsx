import { SelectField } from '@/components/ui/SelectField';
import { allMonths } from '@/utils/months';
import type { PeriodDto } from '@/types/dto';

interface Props {
  period: PeriodDto;
  onChange: (period: PeriodDto) => void;
  disabled?: boolean;
}

export function PeriodPicker({ period, onChange, disabled }: Props) {
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: y, label: String(y) }));

  return (
    <fieldset className="flex gap-3" disabled={disabled}>
      <legend className="sr-only">Periodo de facturación</legend>
      <SelectField
        id="period-month"
        label="Mes"
        options={allMonths()}
        value={period.month}
        onChange={(e) => onChange({ ...period, month: Number(e.target.value) })}
      />
      <SelectField
        id="period-year"
        label="Año"
        options={years}
        value={period.year}
        onChange={(e) => onChange({ ...period, year: Number(e.target.value) })}
      />
    </fieldset>
  );
}
