import { createReactBlockSpec } from "@blocknote/react";
import { Paper, Button, ActionIcon, Box, Group, Text } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import React, { useState, useCallback, useEffect } from "react";
import { DebouncedInput } from "./DebouncedInput";
import "./CustomBlocks.css";

const DatabaseBlockComponent = (props: any) => {
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);

  useEffect(() => {
    setColumns(props.block.props.columns.split(","));
    try {
      const parsedRows = JSON.parse(props.block.props.rows);
      setRows(Array.isArray(parsedRows) ? parsedRows : []);
    } catch {
      setRows([]);
    }
  }, [props.block.props.columns, props.block.props.rows]);

  const updateProps = useCallback(
    (newColumns: string[], newRows: string[][], newTitle: string) => {
      props.editor.updateBlock(props.block, {
        type: "database",
        props: {
          columns: newColumns.join(","),
          rows: JSON.stringify(newRows),
          title: newTitle,
        },
      });
    },
    [props.editor, props.block]
  );

  const addRow = () => {
    const newRow = new Array(columns.length).fill("");
    const newRows = [...rows, newRow];
    updateProps(columns, newRows, props.block.props.title);
  };

  const addColumn = () => {
    const newColumnName = `Column ${columns.length + 1}`;
    const newColumns = [...columns, newColumnName];
    const newRows = rows.map((row) => [...row, ""]);
    updateProps(newColumns, newRows, props.block.props.title);
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = [...rows];
    newRows[rowIndex][colIndex] = value;
    updateProps(columns, newRows, props.block.props.title);
  };

  const updateColumnName = (colIndex: number, value: string) => {
    const newColumns = [...columns];
    newColumns[colIndex] = value;
    updateProps(newColumns, rows, props.block.props.title);
  };

  const removeRow = (rowIndex: number) => {
    const newRows = rows.filter((_, i) => i !== rowIndex);
    updateProps(columns, newRows, props.block.props.title);
  };

  const removeColumn = (colIndex: number) => {
    const newColumns = columns.filter((_, i) => i !== colIndex);
    const newRows = rows.map((row) => row.filter((_, i) => i !== colIndex));
    updateProps(newColumns, newRows, props.block.props.title);
  };

  return (
    <Paper className="database-block-wrapper" shadow="xs" radius="md" p="md" withBorder style={{ width: "100%", overflowX: "auto", margin: "12px 0", backgroundColor: "var(--mantine-color-body)" }}>
      <Group mb="md">
        <DebouncedInput
          variant="transparent"
          size="lg"
          fw={700}
          value={props.block.props.title}
          onChange={(v) => updateProps(columns, rows, v)}
          placeholder="Database Title"
          style={{ flex: 1 }}
        />
      </Group>
      <Box style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: "var(--mantine-radius-sm)", overflow: "hidden" }}>
        <Box style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr)) 44px`, minWidth: 500 }}>
          {/* Header Row */}
          {columns.map((col, index) => (
            <Box key={`h-${index}`} style={{ borderBottom: "1px solid var(--mantine-color-gray-3)", borderRight: "1px solid var(--mantine-color-gray-3)", padding: "4px 8px", backgroundColor: "var(--mantine-color-gray-0)" }}>
              <Group wrap="nowrap" gap="xs">
                <DebouncedInput
                  variant="unstyled"
                  value={col}
                  fw={600}
                  onChange={(v) => updateColumnName(index, v)}
                  style={{ minWidth: 100, flex: 1 }}
                  styles={{ input: { padding: "4px 8px" } }}
                />
                <ActionIcon size="xs" color="gray" variant="subtle" onClick={() => removeColumn(index)}>
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Box>
          ))}
          <Box style={{ borderBottom: "1px solid var(--mantine-color-gray-3)", backgroundColor: "var(--mantine-color-gray-0)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={addColumn}>
              <IconPlus size={16} />
            </ActionIcon>
          </Box>

          {/* Empty state */}
          {rows.length === 0 && (
            <Box style={{ gridColumn: `1 / span ${columns.length + 1}` }}>
              <Text c="dimmed" fs="italic" ta="center" py="sm">行がありません。下のボタンから追加してください。</Text>
            </Box>
          )}

          {/* Rows */}
          {rows.map((row, rowIndex) => (
            <React.Fragment key={rowIndex}>
              {columns.map((_, colIndex) => (
                <Box key={`${rowIndex}-${colIndex}`} style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", borderRight: "1px solid var(--mantine-color-gray-2)" }}>
                  <DebouncedInput
                    variant="unstyled"
                    value={row[colIndex] || ""}
                    placeholder="..."
                    onChange={(v) => updateCell(rowIndex, colIndex, v)}
                    styles={{ input: { padding: "4px 8px", minHeight: "36px" } }}
                  />
                </Box>
              ))}
              <Box style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ActionIcon size="sm" color="red" variant="subtle" onClick={() => removeRow(rowIndex)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Box>
            </React.Fragment>
          ))}
        </Box>
      </Box>
      <Group mt="md">
        <Button variant="light" size="sm" leftSection={<IconPlus size={16} />} onClick={addRow}>
          新規行を追加
        </Button>
      </Group>
    </Paper>
  );
};

export const DatabaseBlock = createReactBlockSpec(
  {
    type: "database",
    propSchema: {
      columns: {
        default: "Name,Tags,Status",
      },
      rows: {
        default: "[]",
      },
      title: {
        default: "Untitled Database",
      },
    },
    content: "none",
  },
  {
    render: DatabaseBlockComponent,
  }
);
