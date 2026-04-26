import React from "react";
import { Box, Group, Text, Checkbox, Select, Stack, MultiSelect } from "@mantine/core";
import { 
    IconAbc, IconNumbers, IconCalendar, IconCircleCheck, 
    IconList, IconTag, IconFunction 
} from "@tabler/icons-react";
import { DatePickerInput } from "@mantine/dates";
import { DebouncedInput } from "./DebouncedInput";
import type { DatabaseColumn, DatabaseColumnType } from "../App";
import dayjs from "dayjs";

interface PagePropertiesProps {
  page: any;
  parentDatabase: any;
  updatePage: (pageId: string, updates: any) => void;
}

const getIconForType = (type: DatabaseColumnType) => {
  switch (type) {
    case "number": return <IconNumbers size={14} />;
    case "checkbox": return <IconCircleCheck size={14} />;
    case "date": return <IconCalendar size={14} />;
    case "select": return <IconList size={14} />;
    case "multi-select": return <IconTag size={14} />;
    case "formula": return <IconFunction size={14} />;
    default: return <IconAbc size={14} />;
  }
};

const calculateFormula = (row: any, col: DatabaseColumn, columns: DatabaseColumn[], visited = new Set<string>()) => {
    if (!col.formula || visited.has(col.id)) return "Circular!";
    visited.add(col.id);
  
    let expression = col.formula;
    columns.forEach(c => {
      if (c.id === col.id) return;

      let val = "";
      if (c.type === 'formula') {
        val = calculateFormula(row, c, columns, visited);
      } else {
        val = row.properties?.[c.id] || (c.type === 'number' ? '0' : '');
      }

      const pattern = new RegExp(`{{${c.name}}}|{{${c.id}}}`, "g");
      expression = expression.replace(pattern, isNaN(Number(val)) ? `"${val}"` : val);
    });
  
    try {
      const result = eval(expression);
      return String(result);
    } catch {
      return "Error";
    } finally {
      visited.delete(col.id);
    }
};

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
              <Group gap={6} style={{ width: 140, flexShrink: 0 }}>
                {getIconForType(col.type)}
                <Text size="sm" fw={500} c="dimmed" truncate>
                  {col.name}
                </Text>
              </Group>
              <Box style={{ flex: 1 }}>
                {col.type === "formula" ? (
                  <Text size="sm" fw={600}>{calculateFormula(page, col, columns)}</Text>
                ) : col.type === "checkbox" ? (
                  <Checkbox 
                    size="xs"
                    checked={value === "true"} 
                    onChange={(e) => updateValue(col.id, e.currentTarget.checked)}
                  />
                ) : col.type === "number" ? (
                  <DebouncedInput
                    variant="unstyled"
                    value={value}
                    onChange={(v) => updateValue(col.id, v)}
                    placeholder="..."
                    size="sm"
                    styles={{ input: { padding: 0, minHeight: 'unset' } }}
                  />
                ) : col.type === "date" ? (
                  <DatePickerInput
                    variant="unstyled"
                    value={value ? dayjs(value).toDate() : null}
                    onChange={(d) => updateValue(col.id, d ? dayjs(d).format("YYYY-MM-DD") : "")}
                    placeholder="日付を選択..."
                    clearable
                    size="sm"
                    styles={{ input: { padding: 0, minHeight: 'unset' } }}
                  />
                ) : col.type === "select" ? (
                  <Select
                    variant="unstyled"
                    data={col.options || []}
                    value={value || null}
                    onChange={(v) => updateValue(col.id, v || "")}
                    placeholder="選択..."
                    searchable
                    size="sm"
                    styles={{ input: { padding: 0, minHeight: 'unset' } }}
                  />
                ) : col.type === "multi-select" ? (
                  <MultiSelect
                    variant="unstyled"
                    data={col.options || []}
                    value={value ? JSON.parse(value) : []}
                    onChange={(v) => updateValue(col.id, JSON.stringify(v))}
                    placeholder="タグを選択..."
                    searchable
                    size="sm"
                    styles={{ input: { padding: 0, minHeight: 'unset' } }}
                  />
                ) : (
                  <DebouncedInput
                    variant="unstyled"
                    value={value}
                    onChange={(v) => updateValue(col.id, v)}
                    placeholder="..."
                    size="sm"
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
