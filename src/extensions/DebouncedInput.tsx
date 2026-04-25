import React, { useState, useEffect } from "react";
import { TextInput, type TextInputProps } from "@mantine/core";

interface DebouncedInputProps extends Omit<TextInputProps, 'onChange'> {
  value: string;
  onChange: (val: string) => void;
}

export const DebouncedInput = ({ value, onChange, ...props }: DebouncedInputProps) => {
  const [localValue, setLocalValue] = useState(value);

  // Sync from props when external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.currentTarget.value);
  };

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <TextInput
      {...props}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};
