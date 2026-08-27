import { AddOptionForm } from "./add-option-form";
import { OptionRow, type OptionRowData } from "./option-row";

export function OptionsEditor({ category, options }: { category: string; options: OptionRowData[] }) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((option, index) => (
        <OptionRow
          key={option.id}
          category={category}
          option={option}
          isFirst={index === 0}
          isLast={index === options.length - 1}
        />
      ))}
      <AddOptionForm category={category} />
    </div>
  );
}
