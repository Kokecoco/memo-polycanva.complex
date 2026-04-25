import React from "react";
import { Box, Group, Text, Checkbox, Select, NumberInput, Stack } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { DebouncedInput } from "./DebouncedInput";
import type { DatabaseColumn } from "../App";
import dayjs from "dayjs";

interface PagePropertiesProps {
  page: any;
  parentDatabase: any;
  updatePage: (pageId: string, updates: any) => void;
}

export const PageProperties: React.FC<PagePropertiesProps> = ({ page, parentDatabase, updatePage }) => {
  const columns = (parentDatabase.databaseColumns || []).map((col: any) => 
    typeof col === "string" ? { id: col, name: col, type: "text" } : col
  ) as DatabaseColumn[];

  const updateValue = (colId: string, value: any) => {
    updatePage(page.id, { 
      properties: { ...page.properties, [colId]: String(value) } 
    });
  };

  if (columns.length === 0) return null;

  return (
    <Box mb="xl" p="md" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", backgroundColor: "var(--mantine-color-gray-0)", borderRadius: "8px" }}>
      <Stack gap="xs">
        {columns.map((col) => {
          const value = page.properties?.[col.id] || "";
          
          return (
            <Group key={col.id} wrap="nowrap" align="center">
              <Text size="sm" fw={500} c="dimmed" style={{ width: 120, flexShrink: 0 }}>
                {col.name}
              </Text>
              <Box style={{ flex: 1 }}>
                {col.type === "checkbox" ? (
                  <Checkbox 
                    checked={value === "true"} 
                    onChange={(e) => updateValue(col.id, e.currentTarget.checked)}
                  />
                ) : col.type === "number" ? (
                  <NumberInput
                    variant="unstyled"
                    value={value ? Number(value) : undefined}
                    onChange={(v) => updateValue(col.id, v)}
                    placeholder="数値..."
                  />
                ) : col.type === "date" ? (
                  <DatePickerInput
                    variant="unstyled"
                    value={value ? dayjs(value).toDate() : null}
                    onChange={(d) => updateValue(col.id, d ? dayjs(d).format("YYYY-MM-DD") : "")}
                    placeholder="日付を選択..."
                    clearable
                  />
                ) : col.type === "select" ? (
                  <Select
                    variant="unstyled"
                    data={col.options || []}
                    value={value}
                    onChange={(v) => {
                      if (v) updateValue(col.id, v);
                    }}
                    placeholder="選択..."
                    searchable
                  />
                ) : (
                  <DebouncedInput
                    variant="unstyled"
                    value={value}
                    onChange={(v) => updateValue(col.id, v)}
                    placeholder="..."
                    styles={{ input: { padding: 0, minHeight: 'unset' } }}
                  />
                )}
              </Box>
            </Group>
          );
        })}
      </Stack>
    </Box>
  );
};
